/**
 * SDMX REST API Client for Pacific Data Hub
 *
 * Fetches dataset indicators from the Pacific Data Hub SDMX REST API
 * via the dissemination endpoint (stats-sdmx-disseminate.pacificdata.org).
 *
 * Uses node:https rather than the global fetch() because the SDMX dissemination
 * server (Cloudflare-fronted DotStat) returns HTTP 500 to undici's HTTP/2
 * negotiation — node:https uses HTTP/1.1 and is accepted.
 *
 * Supports three datasets:
 *   - Sea Level Anomalies:  SPC,DF_CLIMATE_CHANGE,1.0 / A.SEA_LVL.
 *   - Power Generation:     SPC,DF_POWER_GEN,1.0       / A...
 *   - Safely Managed Water: SPC,DF_SDG_06,3.0          / A.SH_H2O_SAFE...._T.....
 *
 * Uses SDMX-JSON format with:
 *   - Query param: format=jsondata (the disseminate host ignores the Accept header)
 *   - dimensionAtObservation=AllDimensions (flat observation list)
 *   - detail=dataonly
 */

import https from "node:https";

const API_BASE = "https://stats-sdmx-disseminate.pacificdata.org/rest/data";

const LAYER_CONFIGS = {
  sea_level: {
    flow: "SPC,DF_CLIMATE_CHANGE,1.0",
    key: "A.SEA_LVL.",
    name: "sea_level",
  },
  power_gen: {
    flow: "SPC,DF_POWER_GEN,1.0",
    key: "A...",
    name: "power_gen",
  },
  water_access: {
    flow: "SPC,DF_SDG_06,3.0",
    key: "A.SH_H2O_SAFE...._T.....",
    name: "water_access",
  },
};

function getUrlSafeCacheKey(layerName) {
  const config = LAYER_CONFIGS[layerName];
  if (!config) throw new Error(`Unknown layer: ${layerName}`);
  return `${config.flow}|${config.key}`;
}

/**
 * Construct the full request URL for a given layer.
 * Path form: {API_BASE}/{flow}/{key}  (no trailing provider segment — the
 * dissemination endpoint does not use it; the SPC agency is embedded in the
 * composite flow ID).
 * @param {string} layerName - one of 'sea_level', 'power_gen', 'water_access'
 * @returns {string} full URL without query string
 */
function buildUrl(layerName) {
  const config = LAYER_CONFIGS[layerName];
  if (!config) throw new Error(`Unknown layer: ${layerName}`);
  return `${API_BASE}/${config.flow}/${config.key}`;
}

/**
 * Fetch SDMX-JSON data for a given layer.
 * @param {string} layerName - one of 'sea_level', 'power_gen', 'water_access'
 * @param {AbortSignal} [signal] - optional AbortSignal for timeout/cancellation
 * @returns {Promise<Object>} parsed SDMX-JSON payload
 * @throws {Error} on network failure or non-2xx response
 */
async function fetchLayerData(layerName, signal) {
  const url = buildUrl(layerName);
  const params = new URLSearchParams({
    dimensionAtObservation: "AllDimensions",
    detail: "dataonly",
    format: "jsondata",
  });
  const fullUrl = `${url}?${params.toString()}`;

  // node:https.get supports an AbortSignal via the second arg options object.
  return new Promise((resolve, reject) => {
    const req = https.get(
      fullUrl,
      {
        headers: {
          Accept: "application/vnd.sdmx.data+json;version=2.1",
        },
        signal,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(
            new Error(
              `SDMX API returned status ${res.statusCode} for layer "${layerName}"`
            )
          );
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error(`Failed to parse SDMX-JSON: ${err.message}`));
          }
        });
      }
    );
    req.on("error", reject);
    if (signal) {
      signal.addEventListener("abort", () => req.destroy(new Error("aborted")));
    }
  });
}

/**
 * Fetch data for a layer with a configurable timeout.
 * @param {string} layerName
 * @param {number} [timeoutMs=10000] - timeout in milliseconds
 * @returns {Promise<Object>}
 */
async function fetchLayerDataWithTimeout(layerName, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const data = await fetchLayerData(layerName, controller.signal);
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

export { LAYER_CONFIGS, getUrlSafeCacheKey, buildUrl, fetchLayerData, fetchLayerDataWithTimeout };
