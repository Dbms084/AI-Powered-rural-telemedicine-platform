(() => {
  const form = document.getElementById("login-form");
  const role = document.getElementById("role");
  const adminKeyWrap = document.getElementById("admin-key-wrap");
  const nameInput = document.getElementById("name");
  const adminKeyInput = document.getElementById("admin-key");

  function toggleAdminKeyField() {
    if (role.value === "admin") {
      adminKeyWrap.classList.remove("hidden");
      adminKeyInput.required = true;
    } else {
      adminKeyWrap.classList.add("hidden");
      adminKeyInput.required = false;
      adminKeyInput.value = "";
    }
  }

  role.addEventListener("change", toggleAdminKeyField);

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = nameInput.value.trim();
    if (!name) {
      return;
    }

    localStorage.setItem("arogya_name", name);
    localStorage.setItem("arogya_role", role.value);

    if (role.value === "admin") {
      const key = adminKeyInput.value.trim();
      if (!key) {
        alert("Please enter admin key.");
        return;
      }
      window.location.href = "/admin?key=" + encodeURIComponent(key);
      return;
    }

    if (role.value === "responder") {
      window.location.href = "/responder.html";
      return;
    }

    window.location.href = "/symptom.html";
  });

  toggleAdminKeyField();
})();
