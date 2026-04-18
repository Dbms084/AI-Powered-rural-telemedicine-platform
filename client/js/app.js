(() => {
  // Shared real-time socket connection for chat and emergency events.
  const socket = io();

  const state = {
    symptomData: null,
    selectedSymptoms: new Set(),
    latestResult: null
  };

  const el = {
    symptomList: document.getElementById("symptom-list"),
    checkBtn: document.getElementById("check-btn"),
    clearBtn: document.getElementById("clear-btn"),
    symptomResult: document.getElementById("symptom-result"),
    userName: document.getElementById("user-name"),
    userRole: document.getElementById("user-role"),
    chatWindow: document.getElementById("chat-window"),
    chatInput: document.getElementById("chat-input"),
    sendBtn: document.getElementById("send-btn"),
    emergencyMessage: document.getElementById("emergency-message"),
    emergencyBtn: document.getElementById("emergency-btn"),
    emergencyStatus: document.getElementById("emergency-status")
  };

  function escapeHtml(value) {
    return value.replace(/[&<>"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;"
    }[char]));
  }

  async function loadSymptoms() {
    const response = await fetch("/api/symptoms");
    const data = await response.json();
    state.symptomData = data;

    el.symptomList.innerHTML = "";
    // Build symptom checkboxes from backend JSON so rules are editable.
    data.symptoms.forEach((item) => {
      const row = document.createElement("label");
      row.className = "symptom-item";
      row.innerHTML =
        '<input type="checkbox" data-symptom-id="' + item.id + '" />' +
        "<span>" + escapeHtml(item.name) + "</span>";
      el.symptomList.appendChild(row);
    });

    el.symptomList.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
      checkbox.addEventListener("change", (event) => {
        const id = event.target.getAttribute("data-symptom-id");
        if (event.target.checked) {
          state.selectedSymptoms.add(id);
        } else {
          state.selectedSymptoms.delete(id);
        }
      });
    });
  }

  function findBestRule() {
    const selected = Array.from(state.selectedSymptoms);
    const rules = state.symptomData.rules;

    let best = null;
    let bestScore = 0;

    // Simple scoring: ratio of matched symptoms to required symptoms.
    rules.forEach((rule) => {
      const matched = rule.requiredSymptoms.filter((symptom) => selected.includes(symptom)).length;
      const score = matched / rule.requiredSymptoms.length;
      if (score > bestScore) {
        bestScore = score;
        best = { ...rule, score: Math.round(score * 100) };
      }
    });

    if (!best || bestScore < 0.5) {
      return null;
    }

    return best;
  }

  async function saveHistory(result) {
    // Store each symptom-check result for later review in admin/history API.
    try {
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: el.userName.value.trim() || "Anonymous",
          selectedSymptoms: Array.from(state.selectedSymptoms),
          possibleCondition: result ? result.condition : "No clear match",
          urgency: result ? result.urgency : "Unknown",
          advice: result ? result.advice : "Consult a doctor for accurate evaluation"
        })
      });
    } catch (error) {
      // History save is best-effort for hackathon prototype.
    }
  }

  async function handleSymptomCheck() {
    if (state.selectedSymptoms.size === 0) {
      el.symptomResult.textContent = "Please select at least one symptom first.";
      return;
    }

    const best = findBestRule();
    state.latestResult = best;

    if (!best) {
      el.symptomResult.innerHTML = "No clear match found. Consult a doctor.";
      saveHistory(null);
      return;
    }

    el.symptomResult.innerHTML =
      "<strong>Possible condition:</strong> " + escapeHtml(best.condition) +
      "<br /><strong>Urgency:</strong> " + escapeHtml(best.urgency) +
      "<br /><strong>Advice:</strong> " + escapeHtml(best.advice) +
      "<br /><strong>Match:</strong> " + best.score + "%";

    saveHistory(best);
  }

  function clearSymptoms() {
    state.selectedSymptoms.clear();
    el.symptomList.querySelectorAll("input[type='checkbox']").forEach((cb) => {
      cb.checked = false;
    });
    el.symptomResult.textContent = "Select symptoms and click Check Symptoms.";
  }

  function appendChatMessage(data) {
    const me = (el.userName.value.trim() || "Anonymous") === data.senderName;
    const row = document.createElement("div");
    row.className = "msg " + (me ? "user" : "other");

    const time = new Date(data.createdAt || Date.now()).toLocaleTimeString();

    row.innerHTML =
      '<span class="msg-meta">' +
      escapeHtml(data.senderName || "Anonymous") +
      " • " +
      escapeHtml((data.role || "user").toUpperCase()) +
      " • " +
      escapeHtml(time) +
      "</span>" +
      '<div>' + escapeHtml(data.text || "") + "</div>";

    el.chatWindow.appendChild(row);
    el.chatWindow.scrollTop = el.chatWindow.scrollHeight;
  }

  function appendSystemMessage(text) {
    const row = document.createElement("div");
    row.className = "msg other";
    row.innerHTML = '<span class="msg-meta">SYSTEM</span><div>' + escapeHtml(text) + "</div>";
    el.chatWindow.appendChild(row);
    el.chatWindow.scrollTop = el.chatWindow.scrollHeight;
  }

  function sendChat() {
    const text = el.chatInput.value.trim();
    if (!text) {
      return;
    }

    // Send chat message to backend for persistence + broadcast.
    socket.emit("chat:send", {
      senderName: el.userName.value.trim() || "Anonymous",
      role: el.userRole.value,
      text
    });

    el.chatInput.value = "";
  }

  async function getLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ error: "Geolocation not supported" });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        () => {
          resolve({ error: "Permission denied or location unavailable" });
        },
        { timeout: 7000 }
      );
    });
  }

  async function triggerEmergency() {
    el.emergencyStatus.textContent = "Sending emergency alert...";

    const location = await getLocation();

    // Emergency payload is pushed instantly to admin room via Socket.IO.
    socket.emit("emergency:trigger", {
      userName: el.userName.value.trim() || "Anonymous",
      message: el.emergencyMessage.value.trim() || "Need urgent help",
      location
    });
  }

  function bindEvents() {
    el.checkBtn.addEventListener("click", handleSymptomCheck);
    el.clearBtn.addEventListener("click", clearSymptoms);
    el.sendBtn.addEventListener("click", sendChat);
    el.chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        sendChat();
      }
    });
    el.emergencyBtn.addEventListener("click", triggerEmergency);
  }

  function bindSocket() {
    socket.on("connect", () => {
      appendSystemMessage("Connected to live server.");
    });

    socket.on("connect_error", () => {
      appendSystemMessage("Unable to connect to server. Check npm start.");
    });

    socket.on("chat:new", (message) => {
      appendChatMessage(message);
    });

    socket.on("emergency:ack", (payload) => {
      if (payload.userName && payload.userName !== (el.userName.value.trim() || "Anonymous")) {
        return;
      }

      el.emergencyStatus.innerHTML =
        "<strong>Status:</strong> " + escapeHtml(payload.status) +
        "<br /><strong>Time:</strong> " + new Date(payload.createdAt).toLocaleString();
    });
  }

  async function init() {
    bindEvents();
    bindSocket();

    try {
      await loadSymptoms();
    } catch (error) {
      el.symptomResult.textContent = "Unable to load symptoms from server. Start backend and refresh.";
    }
  }

  init();
})();
