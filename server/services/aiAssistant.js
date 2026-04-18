const AI_ENABLED = (process.env.AI_ENABLED || "true").toLowerCase() === "true";
const AI_API_KEY = process.env.AI_API_KEY || "";
const AI_API_BASE_URL = process.env.AI_API_BASE_URL || "http://127.0.0.1:11434/v1";
const AI_MODEL = process.env.AI_MODEL || "phi3:mini";
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 60000);
const AI_TEMPERATURE = Number(process.env.AI_TEMPERATURE || 0.2);
const AI_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS || 220);
const INTERNET_CONTEXT_ENABLED = (process.env.INTERNET_CONTEXT_ENABLED || "true").toLowerCase() === "true";

const RED_FLAG_PATTERNS = [
  /heart attack/i,
  /chest pain/i,
  /breath|cannot breathe|can't breathe|shortness of breath/i,
  /unconscious|fainted|passed out/i,
  /stroke|face droop|slurred speech/i,
  /severe bleeding|heavy bleeding/i,
  /major accident|trauma/i
];

const MODERATE_PATTERNS = [
  /high fever|fever.*(2|two|3|three) days/i,
  /persistent vomiting|dehydration/i,
  /severe pain|worsening pain/i,
  /infection|pus|swelling/i
];

const MILD_PATTERNS = [
  /sore throat|mild cough|headache|cold/i,
  /runny nose|body ache|fatigue/i
];

function fallbackReply(text) {
  const input = (text || "").toLowerCase();

  if (input.includes("chest pain") || input.includes("breath") || input.includes("cannot breathe")) {
    return "This may be serious. Please use Emergency Alert immediately and seek urgent in-person medical care.";
  }

  if (input.includes("fever") || input.includes("बुखार")) {
    return "For fever: hydrate, rest, and monitor temperature. If fever lasts more than 48 hours, consult a doctor.";
  }

  if (input.includes("cough") || input.includes("खांसी")) {
    return "For cough: warm fluids and steam inhalation may help. Seek care if breathing worsens.";
  }

  if (input.includes("headache") || input.includes("सिर") || input.includes("दर्द")) {
    return "For headache: hydrate and rest in a quiet place. If severe or persistent, consult a doctor.";
  }

  return "I can help with symptom guidance. Please share duration, severity, and other symptoms for a better assessment.";
}

function createSystemPrompt() {
  return [
    "You are ArogyaLink AI, a telemedicine triage assistant for rural India.",
    "Give concise, practical, and safe guidance in simple language.",
    "Never claim final diagnosis; provide probable explanation and next steps.",
    "If red-flag symptoms appear (breathing trouble, chest pain, unconsciousness, severe bleeding), strongly advise emergency care.",
    "Keep response under 120 words.",
    "If user writes Hindi, respond in Hindi; otherwise in English."
  ].join(" ");
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(AI_TIMEOUT_MS, 9000));

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getDuckDuckGoContext(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query + " medical advice")}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
  const data = await fetchJson(url);

  const facts = [];
  const sources = [];

  if (data?.AbstractText) {
    facts.push(data.AbstractText);
  }

  if (data?.AbstractURL) {
    sources.push(data.AbstractURL);
  }

  if (Array.isArray(data?.RelatedTopics)) {
    data.RelatedTopics.slice(0, 3).forEach((item) => {
      if (item?.Text) {
        facts.push(item.Text);
      }
      if (item?.FirstURL) {
        sources.push(item.FirstURL);
      }
    });
  }

  return {
    facts,
    sources
  };
}

async function getWikipediaContext(query) {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json`;
  const searchData = await fetchJson(searchUrl);
  const title = searchData?.[1]?.[0];

  if (!title) {
    return { facts: [], sources: [] };
  }

  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const summaryData = await fetchJson(summaryUrl);

  const fact = summaryData?.extract || "";
  const source = summaryData?.content_urls?.desktop?.page;

  return {
    facts: fact ? [fact] : [],
    sources: source ? [source] : []
  };
}

function inferMedicalTopic(input) {
  const text = (input || "").toLowerCase();
  const knownTopics = [
    "chest pain",
    "heart attack",
    "stroke",
    "fever",
    "cough",
    "sore throat",
    "headache",
    "breathing trouble",
    "vomiting",
    "diarrhea",
    "trauma"
  ];

  const matched = knownTopics.find((topic) => text.includes(topic));
  if (matched) {
    return matched;
  }

  const cleaned = text.replace(/[^a-z\s]/g, " ");
  const stopWords = new Set([
    "i", "have", "has", "am", "is", "are", "a", "the", "and", "or", "for", "to", "do", "does", "did",
    "my", "me", "what", "should", "can", "with", "since", "yesterday", "today", "please", "help"
  ]);

  const tokens = cleaned
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !stopWords.has(token))
    .slice(0, 6);

  if (tokens.length > 0) {
    return tokens.join(" ");
  }

  return (input || "medical symptoms").toString().slice(0, 60);
}

async function getInternetContext(query) {
  if (!INTERNET_CONTEXT_ENABLED) {
    return { facts: [], sources: [] };
  }

  try {
    const searchTopic = inferMedicalTopic(query);
    const [duckResult, wikiResult] = await Promise.allSettled([
      getDuckDuckGoContext(searchTopic),
      getWikipediaContext(searchTopic)
    ]);

    const duck = duckResult.status === "fulfilled" ? duckResult.value : { facts: [], sources: [] };
    const wiki = wikiResult.status === "fulfilled" ? wikiResult.value : { facts: [], sources: [] };

    const facts = [...duck.facts, ...wiki.facts].filter(Boolean).slice(0, 4);
    const sources = [...duck.sources, ...wiki.sources].filter(Boolean).slice(0, 3);

    return { facts, sources };
  } catch (error) {
    return { facts: [], sources: [] };
  }
}

function appendSources(reply, sources) {
  if (!sources || sources.length === 0) {
    return reply;
  }

  return `${reply}\n\nSources: ${sources.join(" | ")}`;
}

function hasHindiScript(text) {
  return /[\u0900-\u097F]/.test(text || "");
}

function isLikelyEnglishPrompt(text) {
  const value = (text || "").toString();
  return /[a-z]/i.test(value) && !hasHindiScript(value);
}

function isLowQualityReply(userText, replyText) {
  const reply = (replyText || "").toString();

  if (reply.length < 24) {
    return true;
  }

  if (isLikelyEnglishPrompt(userText) && hasHindiScript(reply)) {
    return true;
  }

  return false;
}

async function callOpenAICompatibleModel(userText, internetContextText) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const headers = {
    "Content-Type": "application/json"
  };

  if (AI_API_KEY) {
    headers.Authorization = `Bearer ${AI_API_KEY}`;
  }

  try {
    const response = await fetch(`${AI_API_BASE_URL}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: AI_TEMPERATURE,
        max_tokens: AI_MAX_TOKENS,
        messages: [
          { role: "system", content: createSystemPrompt() },
          {
            role: "user",
            content: internetContextText
              ? `${userText}\n\nLive internet context (verify before acting):\n${internetContextText}`
              : userText
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`AI API failed: ${response.status}`);
    }

    const data = await response.json();
    const output = data?.choices?.[0]?.message?.content?.trim();

    if (!output) {
      throw new Error("AI returned empty response.");
    }

    return output;
  } finally {
    clearTimeout(timer);
  }
}

async function callLocalOllamaModel(userText, internetContextText) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: AI_MODEL,
        stream: false,
        options: {
          temperature: AI_TEMPERATURE,
          num_predict: AI_MAX_TOKENS
        },
        messages: [
          { role: "system", content: createSystemPrompt() },
          {
            role: "user",
            content: internetContextText
              ? `${userText}\n\nLive internet context (verify before acting):\n${internetContextText}`
              : userText
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama API failed: ${response.status}`);
    }

    const data = await response.json();
    const output = data?.message?.content?.trim();

    if (!output) {
      throw new Error("Ollama returned empty response.");
    }

    return output;
  } finally {
    clearTimeout(timer);
  }
}

async function generateMedicalResponse(userText) {
  const assessment = await generateMedicalAssessment(userText);
  return assessment.text;
}

function scoreToBand(score) {
  if (score >= 85) {
    return "EMERGENCY";
  }

  if (score >= 65) {
    return "URGENT";
  }

  if (score >= 40) {
    return "CONSULT_DOCTOR";
  }

  return "SELF_CARE";
}

function inferTriage(userText, sourceType) {
  const input = (userText || "").toString();

  const hasRedFlag = RED_FLAG_PATTERNS.some((pattern) => pattern.test(input));
  const hasModerate = MODERATE_PATTERNS.some((pattern) => pattern.test(input));
  const hasMild = MILD_PATTERNS.some((pattern) => pattern.test(input));

  let severityScore = 50;

  if (hasRedFlag) {
    severityScore = 92;
  } else if (hasModerate) {
    severityScore = 74;
  } else if (hasMild) {
    severityScore = 32;
  }

  let confidenceScore = sourceType === "model" ? 78 : 66;
  if (hasRedFlag) {
    confidenceScore = Math.max(confidenceScore, 88);
  }

  const triageLabel = scoreToBand(severityScore);

  return {
    triageLabel,
    severityScore,
    confidenceScore
  };
}

async function generateMedicalAssessment(userText) {
  const internetContext = await getInternetContext(userText);
  const internetContextText = internetContext.facts.join("\n- ");

  if (!AI_ENABLED) {
    if (internetContextText) {
      const text = appendSources(`I found live web guidance:\n- ${internetContextText}`, internetContext.sources);
      return {
        text,
        ...inferTriage(userText, "internet")
      };
    }
    return {
      text: fallbackReply(userText),
      ...inferTriage(userText, "fallback")
    };
  }

  try {
    const isLocalOllama = AI_API_BASE_URL.includes("127.0.0.1:11434") || AI_API_BASE_URL.includes("localhost:11434");
    const aiReply = isLocalOllama && !AI_API_KEY
      ? await callLocalOllamaModel(userText, internetContextText)
      : await callOpenAICompatibleModel(userText, internetContextText);

    if (isLowQualityReply(userText, aiReply)) {
      if (internetContextText) {
        const text = appendSources(`I found live web guidance:\n- ${internetContextText}`, internetContext.sources);
        return {
          text,
          ...inferTriage(userText, "internet")
        };
      }
      return {
        text: fallbackReply(userText),
        ...inferTriage(userText, "fallback")
      };
    }

    return {
      text: appendSources(aiReply, internetContext.sources),
      ...inferTriage(userText, "model")
    };
  } catch (error) {
    if (internetContextText) {
      const text = appendSources(`I found live web guidance:\n- ${internetContextText}`, internetContext.sources);
      return {
        text,
        ...inferTriage(userText, "internet")
      };
    }
    return {
      text: fallbackReply(userText),
      ...inferTriage(userText, "fallback")
    };
  }
}

module.exports = {
  generateMedicalResponse,
  generateMedicalAssessment,
  fallbackReply,
  aiConfig: {
    enabled: AI_ENABLED,
    model: AI_MODEL,
    baseUrl: AI_API_BASE_URL,
    hasApiKey: Boolean(AI_API_KEY),
    internetContextEnabled: INTERNET_CONTEXT_ENABLED
  }
};
