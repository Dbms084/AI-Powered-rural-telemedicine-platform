(() => {
  const userName = localStorage.getItem("arogya_name") || "";
  const role = localStorage.getItem("arogya_role") || "";

  if (role !== "user") {
    window.location.href = "/";
  }

  const socket = io();

  const el = {
    userBanner: document.getElementById("user-banner"),
    logoutBtn: document.getElementById("logout-btn"),
    chatWindow: document.getElementById("chat-window"),
    chatInput: document.getElementById("chat-input"),
    sendBtn: document.getElementById("send-btn")
  };

  let thinkingRow = null;

  function escapeHtml(value) {
    return (value || "").toString().replace(/[&<>"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;"
    }[char]));
  }

  function logout() {
    localStorage.removeItem("arogya_name");
    localStorage.removeItem("arogya_role");
    window.location.href = "/";
  }

  function appendMessage(data) {
    const me = data.senderName === userName;
    const row = document.createElement("div");
    row.className = "msg " + (me ? "user" : "other");
    const triageMeta = data.triageLabel
      ? '<div class="triage-line">Triage: ' + escapeHtml(data.triageLabel) +
        ' | Severity: ' + escapeHtml(String(data.severityScore ?? "N/A")) + '/100' +
        ' | Confidence: ' + escapeHtml(String(data.confidenceScore ?? "N/A")) + '%</div>'
      : "";

    row.innerHTML =
      '<span class="msg-meta">' +
      escapeHtml(data.senderName || "Unknown") +
      " • " +
      escapeHtml((data.role || "user").toUpperCase()) +
      "</span>" +
      "<div>" + escapeHtml(data.text || "") + "</div>" +
      triageMeta;
    el.chatWindow.appendChild(row);
    el.chatWindow.scrollTop = el.chatWindow.scrollHeight;
  }

  function showThinking() {
    if (thinkingRow) {
      return;
    }

    thinkingRow = document.createElement("div");
    thinkingRow.className = "msg other";
    thinkingRow.innerHTML = '<span class="msg-meta">Arogya AI</span><div>Thinking...</div>';
    el.chatWindow.appendChild(thinkingRow);
    el.chatWindow.scrollTop = el.chatWindow.scrollHeight;
  }

  function hideThinking() {
    if (!thinkingRow) {
      return;
    }
    thinkingRow.remove();
    thinkingRow = null;
  }

  function appendSystem(text) {
    appendMessage({ senderName: "System", role: "info", text });
  }

  function sendMessage() {
    const text = el.chatInput.value.trim();
    if (!text) {
      return;
    }

    socket.emit("chat:send", {
      senderName: userName,
      role: "user",
      text
    });

    el.chatInput.value = "";
  }

  function init() {
    el.userBanner.textContent = "Live Chat • " + userName;

    el.logoutBtn.addEventListener("click", logout);
    el.sendBtn.addEventListener("click", sendMessage);
    el.chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        sendMessage();
      }
    });

    socket.on("connect", () => appendSystem("Connected to live chat."));
    socket.on("connect_error", () => appendSystem("Unable to connect to server."));
    socket.on("chat:new", (message) => {
      if (message.senderName === "Arogya AI") {
        hideThinking();
      }
      appendMessage(message);
    });

    socket.on("ai:status", (payload) => {
      if (payload.status === "thinking") {
        showThinking();
      } else {
        hideThinking();
      }
    });
  }

  init();
})();
