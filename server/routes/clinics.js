const express = require("express");
const {
  getNearbyClinics,
  registerClinicReport
} = require("../services/dispatchAssistant");

const router = express.Router();

router.get("/nearby", (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lng);
  const specialty = (req.query.specialty || "").toString();

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: "lat and lng query params are required." });
  }

  const clinics = getNearbyClinics({ latitude, longitude }, specialty, 5);
  res.json({ clinics });
});

router.post("/report", (req, res) => {
  const payload = req.body || {};
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);

  if (!payload.name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: "name, latitude, and longitude are required." });
  }

  const saved = registerClinicReport({
    ...payload,
    latitude,
    longitude
  });

  res.status(201).json(saved);
});

module.exports = router;
