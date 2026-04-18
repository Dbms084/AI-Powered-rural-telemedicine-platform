(() => {
  const role = localStorage.getItem("arogya_role") || "";
  if (role !== "admin") {
    window.location.href = "/";
  }

  const logoutBtn = document.getElementById("logout-btn");

  // Admin dashboard subscribes to live streams from backend Socket.IO.
  const socket = io();

  const alertsList = document.getElementById("alerts-list");
  const chatFeed = document.getElementById("chat-feed");
  const respondersFeed = document.getElementById("responders-feed");
  const alertFilter = document.getElementById("alert-filter");
  const chatTriageFilter = document.getElementById("chat-triage-filter");
  const responderFilter = document.getElementById("responder-filter");

  const state = {
    alerts: [],
    chats: [],
    responders: []
  };

  function escapeHtml(value) {
    return (value || "").toString().replace(/[&<>"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;"
    }[char]));
  }

  function renderEmpty(target, text) {
    const row = document.createElement("div");
    row.className = "item";
    row.textContent = text;
    target.appendChild(row);
  }

  function getBadgeClass(label) {
    const value = (label || "").toUpperCase();
    if (["EMERGENCY", "URGENT", "NEW", "ESCALATED"].includes(value)) {
      return "badge-red";
    }
    if (["CONSULT_DOCTOR", "ACCEPTED", "BUSY"].includes(value)) {
      return "badge-yellow";
    }
    return "badge-green";
  }

  function badge(label) {
    return '<span class="badge ' + getBadgeClass(label) + '">' + escapeHtml(label || "N/A") + "</span>";
  }

  function renderAuditTrail(trail) {
    if (!Array.isArray(trail) || trail.length === 0) {
      return '<div class="meta">Audit: No actions yet.</div>';
    }

    const items = trail
      .slice()
      .sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime())
      .map((entry) => {
        return "<li>" +
          "<strong>" + escapeHtml(entry.action || "ACTION") + "</strong>" +
          " by " + escapeHtml(entry.actorName || "System") +
          " at " + escapeHtml(new Date(entry.at || Date.now()).toLocaleString()) +
          (entry.note ? " - " + escapeHtml(entry.note) : "") +
          "</li>";
      })
      .join("");

    return '<ul class="audit-list">' + items + "</ul>";
  }

  function getAlertKey(alert) {
    return (alert.localId || alert._id || alert.id || "").toString();
  }

  function addAlert(alert) {
    const key = getAlertKey(alert);
    const index = state.alerts.findIndex((item) => getAlertKey(item) === key);
    if (index === -1) {
      state.alerts.push(alert);
    } else {
      state.alerts[index] = { ...state.alerts[index], ...alert };
    }
    renderAlerts();
  }

  function addChat(chat) {
    state.chats.push(chat);
    renderChats();
  }

  function setResponders(responders) {
    state.responders = Array.isArray(responders) ? responders : [];
    renderResponders();
  }

  function renderAlerts() {
    alertsList.innerHTML = "";
    const filter = (alertFilter.value || "all").toLowerCase();

    const filtered = state.alerts
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .filter((alert) => {
        if (filter === "all") {
          return true;
        }
        return (alert.status || "").toLowerCase() === filter;
      });

    if (filtered.length === 0) {
      renderEmpty(alertsList, "No emergency alerts for this filter.");
      return;
    }

    filtered.forEach((alert) => {
    const item = document.createElement("div");
    item.className = "item alert";

    const locationText = alert.location?.latitude
      ? alert.location.latitude.toFixed(5) + ", " + alert.location.longitude.toFixed(5)
      : (alert.location?.error || "No location");

      item.innerHTML =
        '<div><strong>' + escapeHtml(alert.userName || "Anonymous") + "</strong></div>" +
        '<div>' + escapeHtml(alert.message || "Emergency reported") + "</div>" +
        '<div class="meta">Status: ' + badge((alert.status || "new").toUpperCase()) +
        " | Triage: " + badge((alert.triageLabel || "SELF_CARE").toUpperCase()) + "</div>" +
        '<div class="meta">Location: ' + escapeHtml(locationText) + "</div>" +
        '<div class="meta">Responder: ' + escapeHtml(alert.assignedResponderName || "Unassigned") + "</div>" +
        '<div class="meta">' + new Date(alert.createdAt || Date.now()).toLocaleString() + "</div>" +
        renderAuditTrail(alert.auditTrail);

      alertsList.appendChild(item);
    });
  }

  function renderChats() {
    chatFeed.innerHTML = "";
    const triageFilter = (chatTriageFilter.value || "all").toUpperCase();

    const filtered = state.chats
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .filter((chat) => {
        if (triageFilter === "ALL") {
          return true;
        }
        return (chat.triageLabel || "").toUpperCase() === triageFilter;
      });

    if (filtered.length === 0) {
      renderEmpty(chatFeed, "No chat messages for this filter.");
      return;
    }

    filtered.forEach((chat) => {
      const item = document.createElement("div");
      item.className = "item chat";

      const triageMeta = chat.triageLabel
        ? '<div class="meta">Triage: ' + badge(chat.triageLabel) +
          " | Severity: " + escapeHtml(String(chat.severityScore ?? "N/A")) + "/100" +
          " | Confidence: " + escapeHtml(String(chat.confidenceScore ?? "N/A")) + "%</div>"
        : "";

      item.innerHTML =
        '<div><strong>' + escapeHtml(chat.senderName || "Anonymous") +
        "</strong> (" + escapeHtml((chat.role || "user").toUpperCase()) + ")</div>" +
        '<div>' + escapeHtml(chat.text || "") + "</div>" +
        triageMeta +
        '<div class="meta">' + new Date(chat.createdAt || Date.now()).toLocaleString() + "</div>";

      chatFeed.appendChild(item);
    });
  }

  function renderResponders() {
    respondersFeed.innerHTML = "";
    const availability = (responderFilter.value || "all").toLowerCase();

    const filtered = state.responders
      .slice()
      .sort((a, b) => new Date(b.lastSeen || 0).getTime() - new Date(a.lastSeen || 0).getTime())
      .filter((responder) => {
        if (availability === "all") {
          return true;
        }
        return (responder.availability || "").toLowerCase() === availability;
      });

    if (filtered.length === 0) {
      renderEmpty(respondersFeed, "No responders for this filter.");
      return;
    }

    filtered.forEach((responder) => {
      const item = document.createElement("div");
      item.className = "item";

      item.innerHTML =
        '<div><strong>' + escapeHtml(responder.name || "Responder") + "</strong></div>" +
        '<div class="meta">Availability: ' + badge((responder.availability || "offline").toUpperCase()) + "</div>" +
        '<div class="meta">Last Seen: ' + new Date(responder.lastSeen || Date.now()).toLocaleString() + "</div>";

      respondersFeed.appendChild(item);
    });
  }

  // Joining admin room enables realtime emergency-only broadcasts.
  socket.emit("admin:join");

  socket.on("admin:init", (payload) => {
    state.alerts = payload.alerts || [];
    state.chats = payload.chats || [];
    state.responders = payload.responders || [];
    renderAlerts();
    renderChats();
    renderResponders();
  });

  socket.on("emergency:new", addAlert);
  socket.on("emergency:dispatch", addAlert);
  socket.on("emergency:update", addAlert);
  socket.on("chat:new", addChat);
  socket.on("responder:presence", setResponders);

  alertFilter.addEventListener("change", renderAlerts);
  chatTriageFilter.addEventListener("change", renderChats);
  responderFilter.addEventListener("change", renderResponders);

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("arogya_name");
      localStorage.removeItem("arogya_role");
      window.location.href = "/";
    });
  }
})();
