const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();

router.get("/", (req, res) => {
  try {
    const filePath = path.join(__dirname, "..", "data", "symptoms.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Unable to read symptoms data." });
  }
});

module.exports = router;
