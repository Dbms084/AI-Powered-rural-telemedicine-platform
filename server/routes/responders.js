const express = require("express");
const {
  getNearestResponder,
  registerResponder
} = require("../services/dispatchAssistant");

const router = express.Router();

router.get("/nearest", (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: "lat and lng query params are required." });
  }

  const responder = getNearestResponder({ latitude, longitude });
  res.json({ responder });
});

router.post("/register", (req, res) => {
  const payload = req.body || {};
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);

  if (!payload.name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: "name, latitude, and longitude are required." });
  }

  const saved = registerResponder({
    ...payload,
    latitude,
    longitude
  });

  res.status(201).json(saved);
});

module.exports = router;
