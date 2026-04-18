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
    emergencyMessage: document.getElementById("emergency-message"),
    emergencyBtn: document.getElementById("emergency-btn"),
    emergencyStatus: document.getElementById("emergency-status"),
    dispatchStatus: document.getElementById("dispatch-status"),
    specialtyInput: document.getElementById("specialty-input"),
    findClinicsBtn: document.getElementById("find-clinics-btn"),
    nearbyClinics: document.getElementById("nearby-clinics")
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

    socket.emit("emergency:trigger", {
      userName,
      message: el.emergencyMessage.value.trim() || "Need urgent help",
      location
    });
  }

  function renderClinics(clinics) {
    if (!clinics || clinics.length === 0) {
      el.nearbyClinics.textContent = "No nearby clinics found for this specialty.";
      return;
    }

    el.nearbyClinics.innerHTML = clinics.map((clinic) => {
      const specialists = Array.isArray(clinic.specialistsOnDuty)
        ? clinic.specialistsOnDuty.join(", ")
        : "General";

      return "<div><strong>" + escapeHtml(clinic.name) + "</strong>" +
        "<br />Phone: " + escapeHtml(clinic.phone || "N/A") +
        "<br />Specialists: " + escapeHtml(specialists) +
        "<br />Distance: " + escapeHtml((clinic.distanceKm || 0).toFixed(2)) + " km</div><hr />";
    }).join("");
  }

  async function findNearbyClinics() {
    el.nearbyClinics.textContent = "Finding nearby clinics...";
    const location = await getLocation();

    if (location.error) {
      el.nearbyClinics.textContent = location.error;
      return;
    }

    const specialty = encodeURIComponent(el.specialtyInput.value.trim());
    const query = `/api/clinics/nearby?lat=${location.latitude}&lng=${location.longitude}&specialty=${specialty}`;

    try {
      const response = await fetch(query);
      if (!response.ok) {
        throw new Error("Unable to fetch clinics");
      }
      const data = await response.json();
      renderClinics(data.clinics || []);
    } catch (error) {
      el.nearbyClinics.textContent = "Could not fetch clinics right now.";
    }
  }

  function init() {
    el.userBanner.textContent = "Emergency Alert • " + userName;
    el.logoutBtn.addEventListener("click", logout);
    el.emergencyBtn.addEventListener("click", triggerEmergency);
    el.findClinicsBtn.addEventListener("click", findNearbyClinics);

    socket.on("emergency:ack", (payload) => {
      if (payload.userName && payload.userName !== userName) {
        return;
      }

      el.emergencyStatus.innerHTML =
        "<strong>Status:</strong> " + escapeHtml(payload.status) +
        "<br /><strong>Time:</strong> " + new Date(payload.createdAt).toLocaleString();

      const plan = payload.dispatchPlan || {};
      const responder = plan.nearestResponder;
      const clinic = Array.isArray(plan.nearestClinics) ? plan.nearestClinics[0] : null;

      if (payload.urgent) {
        el.dispatchStatus.innerHTML =
          "<strong>Urgent Dispatch:</strong> Activated" +
          "<br /><strong>Responder:</strong> " + escapeHtml(responder?.name || "Not available") +
          "<br /><strong>Responder Phone:</strong> " + escapeHtml(responder?.phone || "N/A") +
          "<br /><strong>Nearest Clinic:</strong> " + escapeHtml(clinic?.name || "Not available") +
          "<br /><strong>Clinic Phone:</strong> " + escapeHtml(clinic?.phone || "N/A");
      } else {
        el.dispatchStatus.innerHTML = "<strong>Urgent Dispatch:</strong> Not triggered for this message.";
      }
    });

    findNearbyClinics();
  }

  init();
})();
