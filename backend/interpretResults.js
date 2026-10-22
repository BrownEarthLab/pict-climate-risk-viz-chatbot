const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_ROOT =
  "https://generativelanguage.googleapis.com/v1beta/models";

const SHARED_SCIENTIFIC_RULES = `
You are the interpretation assistant embedded in the PICT Climate Risk and
Uncertainty Visualization Tool.

Your job is to explain the analysis that the application has already computed.
Do not invent, recompute, replace, or silently extend the scientific analysis.

Ground every answer in the supplied analysis context. If the context does not
contain information needed to answer a question, say that clearly.

Scientific semantics you must preserve:

1. Long-term extreme heat / TX90p
- Source: NASA NEX-GDDP-CMIP6 daily tasmax.
- The currently processed long-term TX90p layer is for Fiji.
- It uses five climate models.
- The reference period is 1981-2010 from each model's historical simulation.
- TX90p here is the percentage of valid days whose daily maximum temperature
  exceeds that model/grid location's local 90th-percentile baseline.
- H3 is not physical downscaling. The resolution-6 H3 layer is only a display/spatial-index layer and does not increase the native climate-model resolution.
- Ensemble-mean TX90p is the displayed risk value.
- TX90p uncertainty is inter-model max-minus-min spread in percentage points.
- Reliability is derived from normalized inter-model spread. Lower spread
  means higher reliability.
- The studied/default risk display cutoffs are 35% and 50%, but the interface
  may provide different user-selected visualization cutoffs. If current
  cutoffs are supplied, interpret the display using those current cutoffs.
- Do not call reliability a calibrated probability or confidence interval.

2. Daily heat risk
- Source: a rolling Open-Meteo hourly forecast, currently a short 3-day
  forecast workflow.
- Apparent temperature is preferred where available.
- Exposure probability means the fraction of valid forecast-hour values at or
  above the selected heat threshold.
- Forecast spread is P90 minus P10 across forecast-hour values in the current
  analysis. It is NOT inter-model uncertainty and is NOT a calibrated
  confidence interval.
- Expected exposed population is population estimate multiplied by exposure
  probability.
- WorldPop and OpenStreetMap infrastructure are contextual exposure datasets;
  their coverage may be incomplete.
- Do not infer heat sensitivity, vulnerability, hospital capacity, or other
  attributes unless they are explicitly present in the supplied context.

3. Tropical cyclone hazard
- The current layer is an EMPIRIC_TC / STORM-derived hazard field shown on its
  native 0.5 degree grid.
- The current application layer does not include a separate uncertainty layer.
- Do not claim that its filename establishes an exact return-period meaning
  unless that meaning is explicitly supplied in the current context.

General interpretation rules:
- Distinguish hazard, exposure, uncertainty/spread, and reliability.
- Explain percentages and units in plain language.
- Never imply H3 creates finer physical source resolution.
- Never imply population or infrastructure exposure is currently attached to
  TX90p or tropical-cyclone modes unless the supplied context explicitly says
  so.
- Do not make emergency, medical, evacuation, or infrastructure-operability
  decisions for the user.
- Prefer concise, technically accurate answers suitable for a research
  prototype or conference demonstration.
`.trim();

function getGeminiConfig() {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  const model =
    String(process.env.GEMINI_MODEL || "").trim() || DEFAULT_GEMINI_MODEL;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Add it to backend/.env or the process environment.",
    );
  }

  return { apiKey, model };
}

function sanitizeText(value, maxLength = 12000) {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function sanitizeJson(value, maxLength = 30000) {
  let text;
  try {
    text = JSON.stringify(value ?? null, null, 2);
  } catch {
    text = String(value ?? "");
  }

  return text.length > maxLength ? `${text.slice(0, maxLength)}\n…` : text;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  const normalized = [];

  for (const message of history.slice(-12)) {
    const role =
      message?.role === "assistant" || message?.role === "model"
        ? "model"
        : message?.role === "user"
          ? "user"
          : null;

    const content = sanitizeText(message?.content, 5000);

    if (!role || !content) continue;

    const previous = normalized.at(-1);
    if (previous?.role === role) {
      previous.parts[0].text = `${previous.parts[0].text}\n\n${content}`;
    } else {
      normalized.push({
        role,
        parts: [{ text: content }],
      });
    }
  }

  return normalized;
}

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function callGemini({
  systemInstruction,
  contents,
  temperature = 0.2,
  maxOutputTokens = 1200,
}) {
  const { apiKey, model } = getGeminiConfig();
  const endpoint = `${GEMINI_API_ROOT}/${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens,
      },
    }),
  });

  const rawText = await response.text();
  let payload = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const apiMessage =
      payload?.error?.message ||
      rawText ||
      `Gemini API failed with HTTP ${response.status}`;
    throw new Error(`Gemini API error (${response.status}): ${apiMessage}`);
  }

  const text = extractGeminiText(payload);
  if (!text) {
    const finishReason = payload?.candidates?.[0]?.finishReason;
    throw new Error(
      `Gemini returned no text${finishReason ? ` (finish reason: ${finishReason})` : ""}.`,
    );
  }

  return { text, model };
}

function stripJsonFence(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function toStringArray(value, fallback = []) {
  if (!Array.isArray(value)) return [...fallback];

  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeInterpretation(value, rawText) {
  const object = value && typeof value === "object" ? value : {};

  return {
    headline:
      String(object.headline || "").trim() || "Interpretation of the displayed result",
    plain_language_summary:
      String(object.plain_language_summary || "").trim() ||
      sanitizeText(rawText, 3500),
    key_findings: toStringArray(object.key_findings, [
      "Review the displayed values together with the active analysis context.",
    ]),
    uncertainty_notes: toStringArray(object.uncertainty_notes, [
      "Uncertainty must be interpreted according to the active analysis mode.",
    ]),
    recommended_next_steps: toStringArray(object.recommended_next_steps, [
      "Compare nearby areas or alternative display thresholds before drawing conclusions.",
    ]),
    data_limitations: toStringArray(object.data_limitations, [
      "The explanation is limited to the data supplied by the application.",
    ]),
  };
}

export async function interpretResults(resultSummary) {
  const prompt = `
Interpret the following result summary.

Return ONLY a JSON object with exactly these fields:
{
  "headline": "short title",
  "plain_language_summary": "2-4 sentence explanation",
  "key_findings": ["...", "..."],
  "uncertainty_notes": ["...", "..."],
  "recommended_next_steps": ["...", "..."],
  "data_limitations": ["...", "..."]
}

Do not add Markdown fences.

RESULT SUMMARY:
${sanitizeJson(resultSummary)}
`.trim();

  const { text, model } = await callGemini({
    systemInstruction: SHARED_SCIENTIFIC_RULES,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    temperature: 0.15,
    maxOutputTokens: 1400,
  });

  let parsed = null;
  try {
    parsed = JSON.parse(stripJsonFence(text));
  } catch {
    parsed = null;
  }

  return {
    interpretation: normalizeInterpretation(parsed, text),
    provider: "google-gemini",
    model,
  };
}

export async function interpretChat({
  message,
  history = [],
  analysisContext = null,
}) {
  const userMessage = sanitizeText(message, 5000);

  if (!userMessage) {
    throw new Error("A non-empty chat message is required.");
  }

  const contextText = sanitizeJson(analysisContext, 28000);
  const historyContents = normalizeHistory(history);

  const contextTurn = {
    role: "user",
    parts: [
      {
        text: `CURRENT APPLICATION ANALYSIS CONTEXT:\n${contextText}\n\nUse this context for the conversation that follows. If it is null or incomplete, do not invent missing result values.`,
      },
    ],
  };

  const contextAck = {
    role: "model",
    parts: [
      {
        text: "I will interpret only the supplied application context and will state when the available data do not support a claim.",
      },
    ],
  };

  const contents = [
    contextTurn,
    contextAck,
    ...historyContents,
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const { text, model } = await callGemini({
    systemInstruction: SHARED_SCIENTIFIC_RULES,
    contents,
    temperature: 0.2,
    maxOutputTokens: 1100,
  });

  return {
    message: text,
    provider: "google-gemini",
    model,
  };
}
