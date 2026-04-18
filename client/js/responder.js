(() => {
  const role = localStorage.getItem("arogya_role") || "";
  const userName = localStorage.getItem("arogya_name") || "Responder";

  if (role !== "responder") {
    window.location.href = "/";
  }

  const socket = io();

  const responderId = (() => {
    const key = "arogya_responder_id";
    const existing = localStorage.getItem(key);
    if (existing) {
      return existing;
    }
    const generated = "responder-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
    localStorage.setItem(key, generated);
    return generated;
  })();

  const el = {
    banner: document.getElementById("responder-banner"),
    status: document.getElementById("responder-status"),
    feed: document.getElementById("dispatch-feed"),
    logoutBtn: document.getElementById("logout-btn"),
    availabilitySelect: document.getElementById("availability-select"),
    dispatchFilter: document.getElementById("dispatch-filter")
  };

  const state = {
    alerts: [],
    heartbeatTimer: null
  };

  function escapeHtml(value) {
    return (value || "").toString().replace(/[&<>"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;"
    }[char]));
  }

  function logout() {
    socket.emit("responder:availability", {
      responderId,
      name: userName,
      availability: "offline"
    });

    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
    }

    localStorage.removeItem("arogya_name");
    localStorage.removeItem("arogya_role");
    window.location.href = "/";
  }

  function getAlertKey(alert) {
    return (alert.localId || alert._id || alert.id || "").toString();
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
      return '<div class="dispatch-time">No audit actions yet.</div>';
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

  function upsertAlert(alert) {
    const key = getAlertKey(alert);
    const index = state.alerts.findIndex((item) => getAlertKey(item) === key);

    if (index === -1) {
      state.alerts.push(alert);
    } else {
      state.alerts[index] = { ...state.alerts[index], ...alert };
    }

    renderAlerts();
  }

  function currentAvailability() {
    return (el.availabilitySelect.value || "available").toLowerCase();
  }

  function sendHeartbeat() {
    socket.emit("responder:heartbeat", {
      responderId,
      name: userName,
      availability: currentAvailability()
    });
  }

  function setAvailability() {
    socket.emit("responder:availability", {
      responderId,
      name: userName,
      availability: currentAvailability()
    });

    el.status.textContent = "Availability updated to " + currentAvailability() + ".";
  }

  function emitAction(action, alertId) {
    if (!alertId) {
      return;
    }

    socket.emit(action, {
      localId: alertId,
      responderId,
      responderName: userName
    });
  }

  function renderAlerts() {
    el.feed.innerHTML = "";

    const filter = (el.dispatchFilter.value || "all").toLowerCase();
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
      el.feed.innerHTML = "<div class=\"panel\">No dispatches for this filter.</div>";
      return;
    }

    filtered.forEach((alert) => {
    const item = document.createElement("article");
    item.className = "dispatch-item";

    const responder = alert?.dispatchPlan?.nearestResponder;
    const clinic = Array.isArray(alert?.dispatchPlan?.nearestClinics)
      ? alert.dispatchPlan.nearestClinics[0]
      : null;

    const locationText = alert.location?.latitude
      ? alert.location.latitude.toFixed(5) + ", " + alert.location.longitude.toFixed(5)
      : (alert.location?.error || "No location");

    const alertId = getAlertKey(alert);
    const isAccepted = (alert.status || "").toLowerCase() === "accepted";
    const isArrived = (alert.status || "").toLowerCase() === "arrived";

    item.innerHTML =
      "<h3>Urgent Case • " + escapeHtml(alert.userName || "Anonymous") + "</h3>" +
      "<p><strong>Message:</strong> " + escapeHtml(alert.message || "Emergency reported") + "</p>" +
      "<p><strong>Status:</strong> " + badge((alert.status || "urgent").toUpperCase()) + "</p>" +
      "<p><strong>Triage:</strong> " + badge((alert.triageLabel || "EMERGENCY").toUpperCase()) +
      " | Severity: " + escapeHtml(String(alert.severityScore ?? "N/A")) + "/100" +
      " | Confidence: " + escapeHtml(String(alert.confidenceScore ?? "N/A")) + "%</p>" +
      "<p><strong>Location:</strong> " + escapeHtml(locationText) + "</p>" +
      "<p><strong>Nearest Responder:</strong> " + escapeHtml(responder?.name || "Not assigned") + "</p>" +
      "<p><strong>Responder Contact:</strong> " + escapeHtml(responder?.phone || "N/A") + "</p>" +
      "<p><strong>Nearest Clinic:</strong> " + escapeHtml(clinic?.name || "Not available") + "</p>" +
      "<p><strong>Clinic Contact:</strong> " + escapeHtml(clinic?.phone || "N/A") + "</p>" +
      renderAuditTrail(alert.auditTrail) +
      "<div class=\"action-row\">" +
      "<button class=\"btn btn-light action-btn\" data-action=\"emergency:accept\" data-id=\"" + escapeHtml(alertId) + "\" " + (isAccepted || isArrived ? "disabled" : "") + ">Accept Dispatch</button>" +
      "<button class=\"btn action-btn\" data-action=\"emergency:arrived\" data-id=\"" + escapeHtml(alertId) + "\" " + (!isAccepted || isArrived ? "disabled" : "") + ">Mark Arrived</button>" +
      "</div>" +
      "<p class=\"dispatch-time\">" + new Date(alert.createdAt || Date.now()).toLocaleString() + "</p>";

      const buttons = item.querySelectorAll(".action-btn");
      buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
          emitAction(btn.dataset.action, btn.dataset.id);
        });
      });

      el.feed.appendChild(item);
    });
  }

  function init() {
    el.banner.textContent = "Responder Dispatch • " + userName;
    el.logoutBtn.addEventListener("click", logout);
    el.availabilitySelect.addEventListener("change", setAvailability);
    el.dispatchFilter.addEventListener("change", renderAlerts);

    socket.emit("responder:join", {
      responderId,
      name: userName,
      availability: currentAvailability()
    });

    sendHeartbeat();
    state.heartbeatTimer = setInterval(sendHeartbeat, 15000);

    socket.on("responder:ready", (payload) => {
      el.status.textContent = payload?.status || "Connected to responder network.";
    });

    socket.on("responder:init", (payload) => {
      state.alerts = payload?.alerts || [];
      renderAlerts();
    });

    socket.on("emergency:dispatch", (alert) => {
      el.status.textContent = "New urgent dispatch received.";
      upsertAlert(alert);
    });

    socket.on("emergency:update", (alert) => {
      upsertAlert(alert);
    });

    window.addEventListener("beforeunload", () => {
      socket.emit("responder:availability", {
        responderId,
        name: userName,
        availability: "offline"
      });
    });
  }

  init();
})();
