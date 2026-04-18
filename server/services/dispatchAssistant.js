const fs = require("fs");
const path = require("path");

const URGENT_PATTERNS = [
  /heart attack/i,
  /chest pain/i,
  /cannot breathe|can't breathe|breathing trouble/i,
  /unconscious|fainted|passed out/i,
  /stroke|face droop|slurred speech/i,
  /severe bleeding|heavy bleeding|blood loss/i,
  /major accident|trauma|fracture with bleeding/i
];

function readJson(fileName, fallback = []) {
  try {
    const filePath = path.join(__dirname, "..", "data", fileName);
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

const seededClinics = readJson("clinics.json", []);
const seededResponders = readJson("volunteers.json", []);
const crowdsourcedClinics = [];
const crowdsourcedResponders = [];

function isValidCoordinate(value) {
  return Number.isFinite(value) && Math.abs(value) <= 180;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function distanceKm(origin, target) {
  if (!origin || !target) {
    return Number.POSITIVE_INFINITY;
  }

  if (!isValidCoordinate(origin.latitude) || !isValidCoordinate(origin.longitude)) {
    return Number.POSITIVE_INFINITY;
  }

  if (!isValidCoordinate(target.latitude) || !isValidCoordinate(target.longitude)) {
    return Number.POSITIVE_INFINITY;
  }

  const earthKm = 6371;
  const dLat = toRadians(target.latitude - origin.latitude);
  const dLon = toRadians(target.longitude - origin.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(origin.latitude)) *
      Math.cos(toRadians(target.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return 2 * earthKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function detectUrgentReasons(message) {
  const text = (message || "").toString();
  const hits = URGENT_PATTERNS.filter((pattern) => pattern.test(text));
  return hits.map((pattern) => pattern.source);
}

function normalizeSpecialists(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return list.map((item) => (item || "").toString().trim().toLowerCase()).filter(Boolean);
}

function getAllClinics() {
  return [...seededClinics, ...crowdsourcedClinics];
}

function getAllResponders() {
  return [...seededResponders, ...crowdsourcedResponders];
}

function getNearbyClinics(location, specialty, limit = 5) {
  const specialtyToken = (specialty || "").toString().trim().toLowerCase();

  return getAllClinics()
    .filter((clinic) => clinic.onDutyToday !== false)
    .filter((clinic) => {
      if (!specialtyToken) {
        return true;
      }
      const specialists = normalizeSpecialists(clinic.specialistsOnDuty);
      return specialists.includes(specialtyToken);
    })
    .map((clinic) => ({
      ...clinic,
      distanceKm: distanceKm(location, clinic)
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

function getNearestResponder(location) {
  return getAllResponders()
    .filter((responder) => responder.available !== false)
    .map((responder) => ({
      ...responder,
      distanceKm: distanceKm(location, responder)
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
}

function registerClinicReport(payload) {
  const record = {
    id: "crowd-clinic-" + Date.now(),
    name: (payload?.name || "Unnamed Clinic").toString().trim(),
    phone: (payload?.phone || "").toString().trim(),
    latitude: Number(payload?.latitude),
    longitude: Number(payload?.longitude),
    specialistsOnDuty: normalizeSpecialists(payload?.specialistsOnDuty),
    onDutyToday: payload?.onDutyToday !== false,
    source: "crowdsourced",
    createdAt: new Date().toISOString()
  };

  crowdsourcedClinics.push(record);
  return record;
}

function registerResponder(payload) {
  const record = {
    id: "crowd-responder-" + Date.now(),
    name: (payload?.name || "Unnamed Responder").toString().trim(),
    phone: (payload?.phone || "").toString().trim(),
    type: (payload?.type || "volunteer").toString().trim().toLowerCase(),
    latitude: Number(payload?.latitude),
    longitude: Number(payload?.longitude),
    available: payload?.available !== false,
    source: "crowdsourced",
    createdAt: new Date().toISOString()
  };

  crowdsourcedResponders.push(record);
  return record;
}

function buildDispatchPlan({ message, location }) {
  const urgentReasons = detectUrgentReasons(message);
  const urgent = urgentReasons.length > 0;

  const triageLabel = urgent ? "EMERGENCY" : "SELF_CARE";
  const severityScore = urgent ? 92 : 34;
  const confidenceScore = urgent ? 88 : 68;

  const nearestResponder = getNearestResponder(location);
  const nearestClinics = getNearbyClinics(location, urgent ? "cardiology" : "", 3);

  return {
    urgent,
    triageLabel,
    severityScore,
    confidenceScore,
    urgentReasons,
    nearestResponder,
    nearestClinics,
    recommendedAction: urgent
      ? "Urgent red-flag detected. Notify ambulance/paramedic network now and route patient to nearest clinic."
      : "No red-flag urgency detected from message. Continue triage and monitor closely."
  };
}

module.exports = {
  buildDispatchPlan,
  getNearbyClinics,
  getNearestResponder,
  registerClinicReport,
  registerResponder
};
