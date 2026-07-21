const INTERPRETATION_MODEL =
  process.env.OPENAI_INTERPRETATION_MODEL || "gpt-4o-mini";

const INTERPRETATION_SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "string",
    },
    plain_language_summary: {
      type: "string",
    },
    key_findings: {
      type: "array",
      items: {
        type: "string",
      },
    },
    uncertainty_notes: {
      type: "array",
      items: {
        type: "string",
      },
    },
    recommended_next_steps: {
      type: "array",
      items: {
        type: "string",
      },
    },
    data_limitations: {
      type: "array",
      items: {
        type: "string",
      },
    },
  },
  required: [
    "headline",
    "plain_language_summary",
    "key_findings",
    "uncertainty_notes",
    "recommended_next_steps",
    "data_limitations",
  ],
  additionalProperties: false,
};

function getNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function formatPercent(value) {
  const numberValue = getNumber(value);
  if (numberValue === null) return "N/A";
  return `${(numberValue * 100).toFixed(0)}%`;
}

function formatCount(value) {
  const numberValue = getNumber(value);
  if (numberValue === null) return "N/A";
  return Math.round(numberValue).toLocaleString();
}

function formatTemp(value) {
  const numberValue = getNumber(value);
  if (numberValue === null) return "N/A";
  return `${numberValue.toFixed(1)}°C`;
}

function getArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeInterpretation(value) {
  return {
    headline:
      typeof value?.headline === "string"
        ? value.headline
        : "Heat exposure interpretation",
    plain_language_summary:
      typeof value?.plain_language_summary === "string"
        ? value.plain_language_summary
        : "The selected area was analyzed for heat exposure, expected exposed population, and infrastructure exposure.",
    key_findings: getArray(value?.key_findings).map(String).slice(0, 6),
    uncertainty_notes: getArray(value?.uncertainty_notes).map(String).slice(0, 5),
    recommended_next_steps: getArray(value?.recommended_next_steps)
      .map(String)
      .slice(0, 5),
    data_limitations: getArray(value?.data_limitations).map(String).slice(0, 5),
  };
}

function buildFallbackInterpretation(resultSummary) {
  const heat = resultSummary?.heat || {};
  const population = resultSummary?.population || null;
  const infrastructureAssets = resultSummary?.infrastructure_assets || null;

  const thresholdText = formatTemp(resultSummary?.threshold);
  const meanExposureText = formatPercent(heat.mean_exposure_probability);
  const maxExposureText = formatPercent(heat.max_exposure_probability);
  const meanHeatText = formatTemp(heat.mean_heat);
  const meanSpreadText = formatTemp(heat.mean_uncertainty_spread);

  const hasPopulation = population !== null;
  const hasAssets = infrastructureAssets !== null;

  const populationSentence = hasPopulation
    ? ` The expected exposed population is about ${formatCount(
        population.expected_exposed_population
      )} people out of ${formatCount(
        population.total_population
      )}. This is calculated as population × exposure probability, not as a confirmed observed count.`
    : "";

  const assetSentence = hasAssets
    ? ` ${formatCount(infrastructureAssets.exposed_asset_count)} of ${formatCount(
        infrastructureAssets.asset_count
      )} visible infrastructure assets are exposed.`
    : "";

  return {
    headline: "Moderate heat exposure with screening-level uncertainty",
    plain_language_summary: `At the ${thresholdText} threshold, the selected area has a mean crossing probability of ${meanExposureText} and a maximum cell-level probability of ${maxExposureText}.${populationSentence}${assetSentence}`,
    key_findings: [
      `Mean exposure probability is ${meanExposureText}.`,
      `Maximum exposure probability is ${maxExposureText}.`,
      `Mean heat value is ${meanHeatText}.`,
      hasPopulation
        ? `Expected exposed population is ${formatCount(
            population.expected_exposed_population
          )}, calculated as population × exposure probability.`
        : "Expected exposed population was not included in the current visible interpretation.",
      hasAssets
        ? `${formatCount(
            infrastructureAssets.exposed_asset_count
          )} of ${formatCount(
            infrastructureAssets.asset_count
          )} visible infrastructure assets are exposed.`
        : "Infrastructure asset overlay was not included in the current visible interpretation.",
    ],
    uncertainty_notes: [
      `Mean forecast spread is ${meanSpreadText}.`,
      `${formatCount(
        heat.high_uncertainty_cell_count
      )} grid cells are classified as high-uncertainty cells.`,
      "Treat this as a screening-level result rather than a final planning conclusion.",
    ],
    recommended_next_steps: [
      "Rerun the same area at 24°C and 26°C to test threshold sensitivity.",
      "Inspect the highest expected exposed population priority zones before making planning decisions.",
      "Compare this screening result with longer-term climate projection data when available.",
    ],
    data_limitations: [
      "Heat exposure currently uses short-term Open-Meteo forecast data, not long-term climate projections.",
      "Expected exposed population uses WorldPop population counts multiplied by exposure probability.",
      "Infrastructure assets come from OpenStreetMap / Overpass and may be incomplete.",
    ],
  };
}

function buildSystemPrompt() {
  return `
You are a climate-risk planning assistant for Pacific Island Countries and Territories.

Interpret the provided heat-exposure result for a non-expert planner.

Rules:
- Do not overstate certainty.
- Do not claim this is a final planning decision.
- Say that this is a screening-level estimate.
- Mention that heat exposure uses short-term Open-Meteo forecast data, not long-term climate projections.
- If population data is included, say that expected exposed population is calculated as population estimate × exposure probability.
- If population data is included, make clear that expected exposed population is an expected value, not a confirmed observed count of individual people.
- Mention that population exposure uses WorldPop if population data is included.
- Mention that infrastructure assets come from OpenStreetMap / Overpass if assets are included.
- Keep the language plain, practical, and concise.
- Do not invent numbers not present in the summary.
- Do not recommend evacuation or emergency action unless the input clearly supports it.
- Focus on what the current result suggests and what the next analytical step should be.
`.trim();
}

function buildUserPrompt(resultSummary) {
  return `
Interpret this compact heat-exposure result summary.

Return only the structured JSON object requested by the schema.

Important interpretation note:
- "Expected exposed population" means population estimate multiplied by exposure probability.
- It is not a confirmed observed count of individual exposed people.

Result summary:
${JSON.stringify(resultSummary, null, 2)}
`.trim();
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string") {
    return data.output_text;
  }

  const output = Array.isArray(data?.output) ? data.output : [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];

    for (const contentItem of content) {
      if (
        contentItem?.type === "output_text" &&
        typeof contentItem?.text === "string"
      ) {
        return contentItem.text;
      }
    }
  }

  return null;
}

async function callOpenAIInterpretation(resultSummary) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      interpretation: buildFallbackInterpretation(resultSummary),
      used_fallback: true,
      fallback_reason:
        "OPENAI_API_KEY is not set, so the backend returned a local fallback interpretation.",
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: INTERPRETATION_MODEL,
      input: [
        {
          role: "system",
          content: buildSystemPrompt(),
        },
        {
          role: "user",
          content: buildUserPrompt(resultSummary),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "heat_exposure_interpretation",
          strict: true,
          schema: INTERPRETATION_SCHEMA,
        },
      },
      max_output_tokens: 900,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    return {
      interpretation: buildFallbackInterpretation(resultSummary),
      used_fallback: true,
      fallback_reason: `OpenAI request failed with HTTP ${
        response.status
      }: ${errorText.slice(0, 240)}`,
    };
  }

  const data = await response.json();
  const outputText = extractOutputText(data);

  if (!outputText) {
    return {
      interpretation: buildFallbackInterpretation(resultSummary),
      used_fallback: true,
      fallback_reason: "OpenAI response did not include output text.",
    };
  }

  try {
    const parsed = JSON.parse(outputText);

    return {
      interpretation: normalizeInterpretation(parsed),
      used_fallback: false,
      fallback_reason: null,
    };
  } catch (error) {
    return {
      interpretation: buildFallbackInterpretation(resultSummary),
      used_fallback: true,
      fallback_reason: `Could not parse structured interpretation JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

export async function interpretResults(resultSummary) {
  if (!resultSummary || typeof resultSummary !== "object") {
    return {
      interpretation: buildFallbackInterpretation({}),
      used_fallback: true,
      fallback_reason: "Missing or invalid result_summary.",
    };
  }

  return callOpenAIInterpretation(resultSummary);
}