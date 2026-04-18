(function () {
  const state = {
    symptomsData: null,
    chatbotData: null,
    selectedSymptoms: new Set(),
    currentLanguage: localStorage.getItem("arogyalink_lang") || "en",
  };

  const FALLBACK_SYMPTOMS = {
    symptoms: [
      { id: "fever", name: "Fever" },
      { id: "cough", name: "Cough" },
      { id: "headache", name: "Headache" },
      { id: "sore_throat", name: "Sore Throat" },
      { id: "breathlessness", name: "Breathlessness" },
      { id: "chest_pain", name: "Chest Pain" },
    ],
    rules: [
      {
        condition: "Common Cold",
        urgency: "Low",
        requiredSymptoms: ["cough", "sore_throat"],
        advice: "Rest and drink warm fluids.",
      },
      {
        condition: "Flu-like Infection",
        urgency: "Medium",
        requiredSymptoms: ["fever", "cough", "headache"],
        advice: "Monitor symptoms and consult a doctor if needed.",
      },
      {
        condition: "Respiratory Distress (Possible)",
        urgency: "High",
        requiredSymptoms: ["breathlessness", "chest_pain"],
        advice: "Immediate medical help is advised.",
      },
    ],
  };

  const FALLBACK_CHATBOT = {
    intents: [
      {
        id: "greeting",
        keywords: ["hello", "hi", "नमस्ते"],
        responses: {
          en: "Hello, I am ArogyaLink Assistant.",
          hi: "नमस्ते, मैं ArogyaLink सहायक हूं।",
        },
      },
      {
        id: "default",
        keywords: [],
        responses: {
          en: "Please ask about fever, cough, or emergency.",
          hi: "कृपया बुखार, खांसी या आपातकाल के बारे में पूछें।",
        },
      },
    ],
  };

  const elements = {
    symptomList: document.getElementById("symptom-list"),
    checkBtn: document.getElementById("check-btn"),
    clearBtn: document.getElementById("clear-btn"),
    symptomResult: document.getElementById("symptom-result"),
    chatWindow: document.getElementById("chat-window"),
    chatInput: document.getElementById("chat-input"),
    sendBtn: document.getElementById("send-btn"),
    langEnBtn: document.getElementById("lang-en"),
    langHiBtn: document.getElementById("lang-hi"),
    promptBtns: document.querySelectorAll(".prompt-btn"),
    emergencyBtn: document.getElementById("emergency-btn"),
    emergencyStatus: document.getElementById("emergency-status"),
    emergencyMessage: document.getElementById("emergency-message"),
  };

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    try {
      await navigator.serviceWorker.register("sw.js");
      console.log("Service worker registered.");
    } catch (error) {
      console.warn("Service worker registration failed:", error.message);
    }
  }

  async function loadJson(url, fallbackData) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to load " + url);
      }
      return await response.json();
    } catch (error) {
      console.warn("Using fallback data for", url, error.message);
      return fallbackData;
    }
  }

  function renderSymptomOptions() {
    elements.symptomList.innerHTML = "";
    state.symptomsData.symptoms.forEach((symptom) => {
      const wrapper = document.createElement("label");
      wrapper.className = "checkbox-item";
      wrapper.innerHTML =
        '<input type="checkbox" data-symptom-id="' + symptom.id + '" />' +
        "<span>" +
        symptom.name +
        "</span>";
      elements.symptomList.appendChild(wrapper);
    });

    elements.symptomList.querySelectorAll("input[type='checkbox']").forEach((cb) => {
      cb.addEventListener("change", function (event) {
        const symptomId = event.target.getAttribute("data-symptom-id");
        if (event.target.checked) {
          state.selectedSymptoms.add(symptomId);
        } else {
          state.selectedSymptoms.delete(symptomId);
        }
      });
    });
  }

  function getUrgencyBadgeClass(urgency) {
    const value = urgency.toLowerCase();
    if (value === "high") {
      return "high";
    }
    if (value === "medium") {
      return "medium";
    }
    return "low";
  }

  function calculateBestCondition(selectedSymptoms) {
    const selected = Array.from(selectedSymptoms);
    const rules = state.symptomsData.rules;

    let bestRule = null;
    let bestScore = 0;

    rules.forEach((rule) => {
      const matchedCount = rule.requiredSymptoms.filter((symptomId) => selected.includes(symptomId)).length;
      const score = matchedCount / rule.requiredSymptoms.length;
      if (score > bestScore) {
        bestScore = score;
        bestRule = rule;
      }
    });

    if (!bestRule || bestScore < 0.5) {
      return null;
    }

    return {
      ...bestRule,
      score: Math.round(bestScore * 100),
    };
  }

  function handleSymptomCheck() {
    if (state.selectedSymptoms.size === 0) {
      elements.symptomResult.innerHTML = "<p>Please select at least one symptom first.</p>";
      return;
    }

    const result = calculateBestCondition(state.selectedSymptoms);
    if (!result) {
      elements.symptomResult.innerHTML =
        "<p>No clear match found. Please consult a doctor for accurate advice.</p>";
      return;
    }

    const urgencyClass = getUrgencyBadgeClass(result.urgency);
    elements.symptomResult.innerHTML =
      "<p><strong>Possible condition:</strong> " +
      result.condition +
      "</p>" +
      '<p><strong>Urgency:</strong> <span class="badge ' +
      urgencyClass +
      '">' +
      result.urgency +
      "</span></p>" +
      "<p><strong>Advice:</strong> " +
      result.advice +
      "</p>" +
      "<p><strong>Match confidence:</strong> " +
      result.score +
      "%</p>";
  }

  function clearSymptoms() {
    state.selectedSymptoms.clear();
    elements.symptomList.querySelectorAll("input[type='checkbox']").forEach((cb) => {
      cb.checked = false;
    });
    elements.symptomResult.innerHTML = "<p>Select symptoms and click Check Symptoms.</p>";
  }

  function appendChatBubble(sender, text) {
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble " + sender;
    bubble.textContent = text;
    elements.chatWindow.appendChild(bubble);
    elements.chatWindow.scrollTop = elements.chatWindow.scrollHeight;
  }

  function setLanguage(language) {
    state.currentLanguage = language;
    localStorage.setItem("arogyalink_lang", language);
    elements.langEnBtn.classList.toggle("active", language === "en");
    elements.langHiBtn.classList.toggle("active", language === "hi");

    if (language === "hi") {
      elements.chatInput.placeholder = "लक्षण या सवाल लिखें...";
    } else {
      elements.chatInput.placeholder = "Type symptom or question...";
    }
  }

  function findIntent(message) {
    const normalized = message.toLowerCase().trim();
    const intents = state.chatbotData.intents;

    const found = intents.find((intent) => {
      if (!intent.keywords || intent.keywords.length === 0) {
        return false;
      }
      return intent.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
    });

    return found || intents.find((intent) => intent.id === "default") || intents[0];
  }

  function handleSendMessage(sourceText) {
    const text = (sourceText || elements.chatInput.value).trim();
    if (!text) {
      return;
    }

    appendChatBubble("user", text);
    const intent = findIntent(text);
    const reply =
      (intent.responses && intent.responses[state.currentLanguage]) ||
      intent.responses.en ||
      "Please try a different question.";
    appendChatBubble("bot", reply);
    elements.chatInput.value = "";
  }

  function renderEmergencyStatus(statusHtml) {
    elements.emergencyStatus.innerHTML = statusHtml;
  }

  function handleEmergencyAlert() {
    const message = elements.emergencyMessage.value.trim();
    const safeMessage = message || "No additional message provided.";

    alert("Emergency Alert Triggered. Simulating call to 112.");

    renderEmergencyStatus(
      "<p><strong>Status:</strong> Calling emergency number 112 (simulated).</p>" +
        "<p><strong>Message:</strong> " +
        safeMessage +
        "</p>" +
        "<p>Fetching location...</p>"
    );

    if (!navigator.geolocation) {
      renderEmergencyStatus(
        "<p><strong>Status:</strong> Calling emergency number 112 (simulated).</p>" +
          "<p><strong>Message:</strong> " +
          safeMessage +
          "</p>" +
          "<p><strong>Location:</strong> Geolocation is not supported in this browser.</p>"
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function onSuccess(position) {
        const lat = position.coords.latitude.toFixed(5);
        const lng = position.coords.longitude.toFixed(5);
        renderEmergencyStatus(
          "<p><strong>Status:</strong> Calling emergency number 112 (simulated).</p>" +
            "<p><strong>Message:</strong> " +
            safeMessage +
            "</p>" +
            "<p><strong>Location:</strong> " +
            lat +
            ", " +
            lng +
            "</p>"
        );
      },
      function onError() {
        renderEmergencyStatus(
          "<p><strong>Status:</strong> Calling emergency number 112 (simulated).</p>" +
            "<p><strong>Message:</strong> " +
            safeMessage +
            "</p>" +
            "<p><strong>Location:</strong> Location permission denied or unavailable.</p>"
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 7000,
      }
    );
  }

  function bindEvents() {
    elements.checkBtn.addEventListener("click", handleSymptomCheck);
    elements.clearBtn.addEventListener("click", clearSymptoms);

    elements.sendBtn.addEventListener("click", function () {
      handleSendMessage();
    });

    elements.chatInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        handleSendMessage();
      }
    });

    elements.langEnBtn.addEventListener("click", function () {
      setLanguage("en");
      appendChatBubble("bot", "Language switched to English.");
    });

    elements.langHiBtn.addEventListener("click", function () {
      setLanguage("hi");
      appendChatBubble("bot", "भाषा हिंदी में बदल दी गई है।");
    });

    elements.promptBtns.forEach((button) => {
      button.addEventListener("click", function () {
        handleSendMessage(button.getAttribute("data-prompt"));
      });
    });

    elements.emergencyBtn.addEventListener("click", handleEmergencyAlert);
  }

  async function initializeApp() {
    state.symptomsData = await loadJson("data/symptoms.json", FALLBACK_SYMPTOMS);
    state.chatbotData = await loadJson("data/chatbot.json", FALLBACK_CHATBOT);

    renderSymptomOptions();
    bindEvents();
    setLanguage(state.currentLanguage);

    if (state.currentLanguage === "hi") {
      appendChatBubble("bot", "नमस्ते। मैं आपकी मदद के लिए तैयार हूं।");
    } else {
      appendChatBubble("bot", "Hello. I am ready to help with basic symptom guidance.");
    }

    registerServiceWorker();
  }

  initializeApp();
})();