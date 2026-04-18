const mongoose = require("mongoose");

const emergencyAlertSchema = new mongoose.Schema(
  {
    localId: { type: String, default: "" },
    userName: { type: String, default: "Anonymous" },
    message: { type: String, default: "Emergency reported" },
    location: {
      latitude: Number,
      longitude: Number,
      error: String
    },
    status: { type: String, default: "new" },
    triageLabel: { type: String, default: "" },
    severityScore: { type: Number, default: null },
    confidenceScore: { type: Number, default: null },
    assignedResponderId: { type: String, default: "" },
    assignedResponderName: { type: String, default: "" },
    acceptedAt: { type: Date, default: null },
    arrivedAt: { type: Date, default: null },
    escalatedAt: { type: Date, default: null },
    auditTrail: { type: [mongoose.Schema.Types.Mixed], default: [] },
    dispatchPlan: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model("EmergencyAlert", emergencyAlertSchema);
