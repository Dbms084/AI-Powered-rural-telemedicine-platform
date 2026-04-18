const express = require("express");
const SymptomHistory = require("../models/SymptomHistory");
const mongoose = require("mongoose");

const router = express.Router();
const memoryHistory = [];

function isDbReady() {
  return mongoose.connection.readyState === 1;
}

router.get("/", async (req, res) => {
  if (!isDbReady()) {
    return res.json(memoryHistory.slice().reverse());
  }

  try {
    const items = await SymptomHistory.find().sort({ createdAt: -1 }).limit(50);
    res.json(items);
  } catch (error) {
    res.json(memoryHistory.slice().reverse());
  }
});

router.post("/", async (req, res) => {
  const payload = req.body || {};

  try {
    if (!isDbReady()) {
      const fallbackRecord = {
        userName: payload.userName || "Anonymous",
        selectedSymptoms: payload.selectedSymptoms || [],
        possibleCondition: payload.possibleCondition || "Unknown",
        urgency: payload.urgency || "Unknown",
        advice: payload.advice || "",
        createdAt: new Date().toISOString()
      };
      memoryHistory.push(fallbackRecord);
      return res.status(201).json(fallbackRecord);
    }

    const record = await SymptomHistory.create({
      userName: payload.userName || "Anonymous",
      selectedSymptoms: payload.selectedSymptoms || [],
      possibleCondition: payload.possibleCondition || "Unknown",
      urgency: payload.urgency || "Unknown",
      advice: payload.advice || ""
    });

    res.status(201).json(record);
  } catch (error) {
    const fallbackRecord = {
      userName: payload.userName || "Anonymous",
      selectedSymptoms: payload.selectedSymptoms || [],
      possibleCondition: payload.possibleCondition || "Unknown",
      urgency: payload.urgency || "Unknown",
      advice: payload.advice || "",
      createdAt: new Date().toISOString()
    };
    memoryHistory.push(fallbackRecord);
    res.status(201).json(fallbackRecord);
  }
});

module.exports = router;
