(() => {
  const userName = localStorage.getItem("arogya_name") || "";
  const role = localStorage.getItem("arogya_role") || "";

  if (role !== "user") {
    window.location.href = "/";
  }

  const state = {
    symptomData: null,
    selectedSymptoms: new Set()
  };

  const el = {
    userBanner: document.getElementById("user-banner"),
    logoutBtn: document.getElementById("logout-btn"),
    symptomList: document.getElementById("symptom-list"),
    checkBtn: document.getElementById("check-btn"),
    clearBtn: document.getElementById("clear-btn"),
    symptomResult: document.getElementById("symptom-result")
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
    localStorage.removeItem("arogya_name");
    localStorage.removeItem("arogya_role");
    window.location.href = "/";
  }

  async function loadSymptoms() {
    const response = await fetch("/api/symptoms");
    const data = await response.json();
    state.symptomData = data;

    el.symptomList.innerHTML = "";
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
    try {
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName,
          selectedSymptoms: Array.from(state.selectedSymptoms),
          possibleCondition: result ? result.condition : "No clear match",
          urgency: result ? result.urgency : "Unknown",
          advice: result ? result.advice : "Consult a doctor for accurate evaluation"
        })
      });
    } catch (error) {
      // Best effort save.
    }
  }

  function handleSymptomCheck() {
    if (state.selectedSymptoms.size === 0) {
      el.symptomResult.textContent = "Please select at least one symptom first.";
      return;
    }

    const best = findBestRule();

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

  async function init() {
    el.userBanner.textContent = "Symptom Checker • " + userName;
    el.logoutBtn.addEventListener("click", logout);
    el.checkBtn.addEventListener("click", handleSymptomCheck);
    el.clearBtn.addEventListener("click", clearSymptoms);

    try {
      await loadSymptoms();
    } catch (error) {
      el.symptomResult.textContent = "Unable to load symptoms from server.";
    }
  }

  init();
})();
