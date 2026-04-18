const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    senderName: { type: String, default: "Anonymous" },
    role: { type: String, enum: ["user", "doctor", "admin", "responder"], default: "user" },
    text: { type: String, required: true, trim: true },
    room: { type: String, default: "general" },
    triageLabel: { type: String, default: "" },
    severityScore: { type: Number, default: null },
    confidenceScore: { type: Number, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ChatMessage", chatMessageSchema);
