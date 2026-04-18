const mongoose = require("mongoose");

const responderStatusSchema = new mongoose.Schema(
  {
    responderId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: "Responder" },
    availability: { type: String, enum: ["available", "busy", "offline"], default: "available" },
    lastSeen: { type: Date, default: Date.now },
    socketId: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ResponderStatus", responderStatusSchema);
