const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
require("dotenv").config();

const ChatMessage = require("./models/ChatMessage");
const EmergencyAlert = require("./models/EmergencyAlert");
const ResponderStatus = require("./models/ResponderStatus");
const { generateMedicalAssessment, fallbackReply, aiConfig } = require("./services/aiAssistant");
const { buildDispatchPlan } = require("./services/dispatchAssistant");
const symptomsRoute = require("./routes/symptoms");
const historyRoute = require("./routes/history");
const clinicsRoute = require("./routes/clinics");
const respondersRoute = require("./routes/responders");

const BASE_PORT = Number(process.env.PORT) || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/arogyalink";
const ADMIN_KEY = process.env.ADMIN_KEY || "admin123";
const DISPATCH_ARRIVAL_TIMEOUT_MINUTES = Number(process.env.DISPATCH_ARRIVAL_TIMEOUT_MINUTES || 8);
const ESCALATION_CHECK_INTERVAL_MS = 30000;
const CHAT_REPLY_TIMEOUT_MS = Number(process.env.CHAT_REPLY_TIMEOUT_MS || 20000);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

let dbConnected = false;

async function connectDatabase() {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });
    dbConnected = true;
    console.log("MongoDB connected");
  } catch (error) {
    dbConnected = false;
    console.warn("MongoDB connection failed. Server will still run for socket demo.");
  }
}

app.use(cors());
app.use(express.json());

// REST endpoints for symptom rules and history tracking.
app.use("/api/symptoms", symptomsRoute);
app.use("/api/history", historyRoute);
app.use("/api/clinics", clinicsRoute);
app.use("/api/responders", respondersRoute);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", dbConnected, ai: aiConfig });
});

app.use(express.static(path.join(__dirname, "..", "client")));

// Hide direct admin file access from normal users.
app.get("/admin.html", (req, res) => {
  res.status(404).send("Not found");
});

app.get("/admin", (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.redirect("/");
  }

  res.sendFile(path.join(__dirname, "..", "client", "admin.html"));
});

const memoryStore = {
  chats: [],
  alerts: [],
  responders: {}
};

function nowIso() {
  return new Date().toISOString();
}

function createLocalAlertId() {
  return "alert-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
}

function getAlertIdentifier(payload = {}) {
  return (payload.localId || payload.alertId || payload._id || payload.id || "").toString().trim();
}

function triageLabelToColor(label = "") {
  const value = label.toUpperCase();
  if (value === "EMERGENCY") {
    return "red";
  }
  if (value === "CONSULT_DOCTOR" || value === "URGENT") {
    return "yellow";
  }
  return "green";
}

async function getAssessmentWithTimeout(userText) {
  const timeoutAssessment = {
    text: fallbackReply(userText),
    triageLabel: "CONSULT_DOCTOR",
    severityScore: 55,
    confidenceScore: 62
  };

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve(timeoutAssessment), CHAT_REPLY_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      generateMedicalAssessment(userText),
      timeoutPromise
    ]);
  } catch (error) {
    return timeoutAssessment;
  }
}

async function getResponderPresenceList() {
  if (dbConnected) {
    const docs = await ResponderStatus.find().sort({ lastSeen: -1 }).limit(80);
    return docs.map((doc) => doc.toObject());
  }

  return Object.values(memoryStore.responders).sort((a, b) => {
    return new Date(b.lastSeen || 0).getTime() - new Date(a.lastSeen || 0).getTime();
  });
}

async function upsertResponderPresence(payload = {}) {
  const responderId = (payload.responderId || "").toString().trim();
  if (!responderId) {
    return null;
  }

  const update = {
    responderId,
    name: (payload.name || "Responder").toString(),
    availability: ["available", "busy", "offline"].includes(payload.availability) ? payload.availability : "available",
    lastSeen: payload.lastSeen ? new Date(payload.lastSeen) : new Date(),
    socketId: (payload.socketId || "").toString()
  };

  if (dbConnected) {
    const doc = await ResponderStatus.findOneAndUpdate(
      { responderId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return doc.toObject();
  }

  const existing = memoryStore.responders[responderId] || { responderId };
  const merged = { ...existing, ...update };
  memoryStore.responders[responderId] = merged;
  return merged;
}

async function updateAlertLifecycle(payload = {}) {
  const id = getAlertIdentifier(payload);
  if (!id) {
    return null;
  }

  if (dbConnected) {
    let query = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { _id: id };
    } else {
      query = { localId: id };
    }

    const doc = await EmergencyAlert.findOneAndUpdate(query, { $set: payload }, { new: true });
    return doc ? doc.toObject() : null;
  }

  const index = memoryStore.alerts.findIndex((item) => {
    return item.localId === id || String(item._id || "") === id;
  });

  if (index === -1) {
    return null;
  }

  memoryStore.alerts[index] = {
    ...memoryStore.alerts[index],
    ...payload
  };

  return memoryStore.alerts[index];
}

function createAuditEntry({ action, actorId = "", actorName = "System", note = "" }) {
  return {
    action,
    actorId,
    actorName,
    note,
    at: nowIso()
  };
}

async function appendAlertAudit(payload = {}) {
  const id = getAlertIdentifier(payload);
  const entry = payload.entry;

  if (!id || !entry) {
    return null;
  }

  if (dbConnected) {
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { localId: id };
    const doc = await EmergencyAlert.findOneAndUpdate(
      query,
      { $push: { auditTrail: entry } },
      { new: true }
    );
    return doc ? doc.toObject() : null;
  }

  const index = memoryStore.alerts.findIndex((item) => item.localId === id || String(item._id || "") === id);
  if (index === -1) {
    return null;
  }

  const existingTrail = Array.isArray(memoryStore.alerts[index].auditTrail)
    ? memoryStore.alerts[index].auditTrail
    : [];

  memoryStore.alerts[index] = {
    ...memoryStore.alerts[index],
    auditTrail: [...existingTrail, entry]
  };

  return memoryStore.alerts[index];
}

async function applyAlertUpdateWithAudit({ identifier, setPayload, auditEntry }) {
  const updated = await updateAlertLifecycle({
    localId: identifier,
    ...setPayload
  });

  if (!updated) {
    return null;
  }

  const withAudit = await appendAlertAudit({
    localId: identifier,
    entry: auditEntry
  });

  return withAudit || updated;
}

async function escalateOverdueAcceptedAlerts() {
  const threshold = new Date(Date.now() - DISPATCH_ARRIVAL_TIMEOUT_MINUTES * 60 * 1000);

  if (dbConnected) {
    const overdue = await EmergencyAlert.find({
      status: "accepted",
      acceptedAt: { $lte: threshold },
      arrivedAt: null
    }).limit(50);

    for (const alert of overdue) {
      const note = `No arrival update within ${DISPATCH_ARRIVAL_TIMEOUT_MINUTES} minutes.`;
      const escalated = await applyAlertUpdateWithAudit({
        identifier: alert.localId || String(alert._id),
        setPayload: {
          status: "escalated",
          escalatedAt: new Date()
        },
        auditEntry: createAuditEntry({
          action: "ESCALATED_TIMEOUT",
          actorName: "System",
          note
        })
      });

      if (escalated) {
        io.to("admins").emit("emergency:update", escalated);
        io.to("responders").emit("emergency:update", escalated);
      }
    }

    return;
  }

  for (let i = 0; i < memoryStore.alerts.length; i += 1) {
    const alert = memoryStore.alerts[i];
    if (alert.status !== "accepted" || !alert.acceptedAt || alert.arrivedAt) {
      continue;
    }

    if (new Date(alert.acceptedAt).getTime() > threshold.getTime()) {
      continue;
    }

    const note = `No arrival update within ${DISPATCH_ARRIVAL_TIMEOUT_MINUTES} minutes.`;
    const entry = createAuditEntry({ action: "ESCALATED_TIMEOUT", actorName: "System", note });
    const existingTrail = Array.isArray(alert.auditTrail) ? alert.auditTrail : [];

    memoryStore.alerts[i] = {
      ...alert,
      status: "escalated",
      escalatedAt: new Date(),
      auditTrail: [...existingTrail, entry]
    };

    io.to("admins").emit("emergency:update", memoryStore.alerts[i]);
    io.to("responders").emit("emergency:update", memoryStore.alerts[i]);
  }
}

io.on("connection", (socket) => {
  // Admin clients join a dedicated room to receive emergency broadcasts.
  socket.on("admin:join", async () => {
    socket.join("admins");

    try {
      const recentChats = dbConnected
        ? await ChatMessage.find().sort({ createdAt: -1 }).limit(30)
        : memoryStore.chats.slice(-30);

      const recentAlerts = dbConnected
        ? await EmergencyAlert.find().sort({ createdAt: -1 }).limit(30)
        : memoryStore.alerts.slice(-30);

      const responders = await getResponderPresenceList();

      socket.emit("admin:init", {
        chats: recentChats.reverse(),
        alerts: recentAlerts.reverse(),
        responders
      });
    } catch (error) {
      socket.emit("admin:init", { chats: [], alerts: [], responders: [] });
    }
  });

  socket.on("responder:join", async (payload = {}) => {
    socket.join("responders");
    socket.data.responderId = (payload.responderId || "").toString();
    socket.data.responderName = (payload.name || "Responder").toString();

    await upsertResponderPresence({
      responderId: socket.data.responderId,
      name: socket.data.responderName,
      availability: payload.availability || "available",
      socketId: socket.id,
      lastSeen: nowIso()
    });

    socket.emit("responder:ready", { status: "joined responder network" });

    try {
      const recentUrgentAlerts = dbConnected
        ? await EmergencyAlert.find({ status: { $in: ["urgent", "accepted", "arrived", "escalated"] } }).sort({ createdAt: -1 }).limit(20)
        : memoryStore.alerts.filter((item) => ["urgent", "accepted", "arrived", "escalated"].includes(item.status)).slice(-20);

      const responders = await getResponderPresenceList();

      socket.emit("responder:init", {
        alerts: recentUrgentAlerts.reverse(),
        responders
      });

      io.to("admins").emit("responder:presence", responders);
      io.to("responders").emit("responder:presence", responders);
    } catch (error) {
      socket.emit("responder:init", { alerts: [], responders: [] });
    }
  });

  socket.on("responder:heartbeat", async (payload = {}) => {
    await upsertResponderPresence({
      responderId: (payload.responderId || socket.data.responderId || "").toString(),
      name: payload.name || socket.data.responderName || "Responder",
      availability: payload.availability || "available",
      socketId: socket.id,
      lastSeen: nowIso()
    });

    const responders = await getResponderPresenceList();
    io.to("admins").emit("responder:presence", responders);
    io.to("responders").emit("responder:presence", responders);
  });

  socket.on("responder:availability", async (payload = {}) => {
    await upsertResponderPresence({
      responderId: (payload.responderId || socket.data.responderId || "").toString(),
      name: payload.name || socket.data.responderName || "Responder",
      availability: payload.availability || "available",
      socketId: socket.id,
      lastSeen: nowIso()
    });

    const responders = await getResponderPresenceList();
    io.to("admins").emit("responder:presence", responders);
    io.to("responders").emit("responder:presence", responders);
  });

  socket.on("chat:send", async (payload) => {
    const safePayload = {
      senderName: payload?.senderName || "Anonymous",
      role: payload?.role || "user",
      text: (payload?.text || "").toString().trim(),
      room: payload?.room || "general"
    };

    if (!safePayload.text) {
      return;
    }

    let saved;
    try {
      if (dbConnected) {
        saved = await ChatMessage.create(safePayload);
      } else {
        saved = { ...safePayload, createdAt: new Date() };
        memoryStore.chats.push(saved);
      }
    } catch (error) {
      saved = { ...safePayload, createdAt: new Date() };
      memoryStore.chats.push(saved);
    }

    // Broadcast every new chat message to all connected clients.
    io.emit("chat:new", saved);

    if (safePayload.role === "user") {
      socket.emit("ai:status", { status: "thinking" });

      try {
        const assessment = await getAssessmentWithTimeout(safePayload.text);

        const aiPayload = {
          senderName: "Arogya AI",
          role: "doctor",
          text: assessment.text,
          triageLabel: assessment.triageLabel,
          severityScore: assessment.severityScore,
          confidenceScore: assessment.confidenceScore,
          room: safePayload.room
        };

        let aiSaved;
        try {
          if (dbConnected) {
            aiSaved = await ChatMessage.create(aiPayload);
          } else {
            aiSaved = { ...aiPayload, createdAt: new Date() };
            memoryStore.chats.push(aiSaved);
          }
        } catch (error) {
          aiSaved = { ...aiPayload, createdAt: new Date() };
          memoryStore.chats.push(aiSaved);
        }

        io.emit("chat:new", aiSaved);
      } finally {
        socket.emit("ai:status", { status: "ready" });
      }
    }
  });

  socket.on("emergency:trigger", async (payload) => {
    const dispatchPlan = buildDispatchPlan({
      message: payload?.message,
      location: payload?.location
    });

    const safePayload = {
      localId: createLocalAlertId(),
      userName: payload?.userName || "Anonymous",
      message: payload?.message || "Emergency reported",
      location: payload?.location || {},
      status: dispatchPlan.urgent ? "urgent" : "new",
      triageLabel: dispatchPlan.triageLabel,
      severityScore: dispatchPlan.severityScore,
      confidenceScore: dispatchPlan.confidenceScore,
      auditTrail: [
        createAuditEntry({
          action: "CREATED",
          actorName: payload?.userName || "Patient",
          note: "Emergency alert created by patient."
        }),
        createAuditEntry({
          action: dispatchPlan.urgent ? "DISPATCHED_URGENT" : "SUBMITTED_TRIAGE",
          actorName: "System",
          note: dispatchPlan.urgent
            ? "Urgent dispatch event sent to responder network."
            : "Submitted for admin triage review."
        })
      ],
      dispatchPlan
    };

    let saved;
    try {
      if (dbConnected) {
        saved = await EmergencyAlert.create(safePayload);
      } else {
        saved = { ...safePayload, createdAt: new Date() };
        memoryStore.alerts.push(saved);
      }
    } catch (error) {
      saved = { ...safePayload, createdAt: new Date() };
      memoryStore.alerts.push(saved);
    }

    // Emergency alerts are sent to admins, and sender gets acknowledgement.
    io.to("admins").emit("emergency:new", saved);

    if (dispatchPlan.urgent) {
      io.to("responders").emit("emergency:dispatch", saved);
      io.to("admins").emit("emergency:dispatch", saved);
    }

    const nearestResponderText = dispatchPlan.nearestResponder
      ? `${dispatchPlan.nearestResponder.name} (${dispatchPlan.nearestResponder.type})`
      : "No responder found";

    const nearestClinicText = dispatchPlan.nearestClinics[0]
      ? dispatchPlan.nearestClinics[0].name
      : "No nearby clinic found";

    socket.emit("emergency:ack", {
      userName: safePayload.userName,
      status: dispatchPlan.urgent
        ? `Urgent case detected. Notified responder network. Nearest responder: ${nearestResponderText}. Nearest clinic: ${nearestClinicText}.`
        : "Emergency sent to admin dashboard for triage.",
      urgent: dispatchPlan.urgent,
      dispatchPlan,
      createdAt: new Date().toISOString()
    });
  });

  socket.on("emergency:accept", async (payload = {}) => {
    const identifier = getAlertIdentifier(payload);
    const responderName = (payload.responderName || "Responder").toString();
    const updated = await applyAlertUpdateWithAudit({
      identifier,
      setPayload: {
        status: "accepted",
        assignedResponderId: (payload.responderId || "").toString(),
        assignedResponderName: responderName,
        acceptedAt: new Date()
      },
      auditEntry: createAuditEntry({
        action: "ACCEPTED",
        actorId: (payload.responderId || "").toString(),
        actorName: responderName,
        note: "Responder accepted the dispatch."
      })
    });

    if (!updated) {
      return;
    }

    io.to("admins").emit("emergency:update", updated);
    io.to("responders").emit("emergency:update", updated);
  });

  socket.on("emergency:arrived", async (payload = {}) => {
    const identifier = getAlertIdentifier(payload);
    const responderName = (payload.responderName || "Responder").toString();
    const updated = await applyAlertUpdateWithAudit({
      identifier,
      setPayload: {
        status: "arrived",
        assignedResponderId: (payload.responderId || "").toString(),
        assignedResponderName: responderName,
        arrivedAt: new Date()
      },
      auditEntry: createAuditEntry({
        action: "ARRIVED",
        actorId: (payload.responderId || "").toString(),
        actorName: responderName,
        note: "Responder marked arrival at patient location."
      })
    });

    if (!updated) {
      return;
    }

    io.to("admins").emit("emergency:update", updated);
    io.to("responders").emit("emergency:update", updated);
  });

  socket.on("disconnect", async () => {
    if (!socket.data.responderId) {
      return;
    }

    await upsertResponderPresence({
      responderId: socket.data.responderId,
      name: socket.data.responderName || "Responder",
      availability: "offline",
      socketId: "",
      lastSeen: nowIso()
    });

    const responders = await getResponderPresenceList();
    io.to("admins").emit("responder:presence", responders);
    io.to("responders").emit("responder:presence", responders);
  });
});

function startServer(port, attemptsLeft = 20) {
  server.listen(port);

  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is busy. Trying ${nextPort}...`);
      startServer(nextPort, attemptsLeft - 1);
      return;
    }

    console.error("Server failed to start:", error.message);
    process.exit(1);
  });
}

server.once("listening", () => {
  const address = server.address();
  const activePort = typeof address === "object" && address ? address.port : BASE_PORT;
  console.log(`Server running on http://localhost:${activePort}`);
});

startServer(BASE_PORT);

connectDatabase();

setInterval(() => {
  escalateOverdueAcceptedAlerts().catch(() => {
    // Intentionally silent to avoid noisy logs during transient network/database issues.
  });
}, ESCALATION_CHECK_INTERVAL_MS);
