const mongoose = require("mongoose");

const symptomHistorySchema = new mongoose.Schema(
  {
    userName: { type: String, default: "Anonymous" },
    selectedSymptoms: { type: [String], default: [] },
    possibleCondition: { type: String, default: "Unknown" },
    urgency: { type: String, enum: ["Low", "Medium", "High", "Unknown"], default: "Unknown" },
    advice: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("SymptomHistory", symptomHistorySchema);
