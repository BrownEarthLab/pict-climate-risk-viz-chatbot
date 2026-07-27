/**
 * SDMX Observation Parser
 *
 * Temporary home for parseSdmxObservations so the pytest unit test can
 * import it via Node.js subprocess.  This is a verbatim copy of the
 * function that also lives in server.js.  gh issue #2 should extract
 * the function here and import it from server.js, eliminating the
 * duplication.
 */

/**
 * Parse SDMX-JSON observation data into a flat observation list.
 *
 * For sea_level: averages the most recent 10 years of observations per region.
 * For power_gen and water_access: sums across sub-dimensions, keeps latest year.
 *
 * @param {Object} sdmxData - The SDMX-JSON payload
 * @param {string} layerName - "sea_level", "power_gen", or "water_access"
 * @returns {Array<{geoPictCode: string, value: number, year: string}>}
 */
export function parseSdmxObservations(sdmxData, layerName) {
  if (!sdmxData || !sdmxData.data || !Array.isArray(sdmxData.data.dataSets)) {
    return [];
  }
  const structure = sdmxData.data.structure;
  if (!structure || !structure.dimensions || !structure.dimensions.observation) {
    return [];
  }

  const obsDims = structure.dimensions.observation;
  let geoPos = -1;
  let timePos = -1;
  for (let i = 0; i < obsDims.length; i++) {
    if (obsDims[i].id === "GEO_PICT") geoPos = i;
    if (obsDims[i].id === "TIME_PERIOD") timePos = i;
  }
  if (geoPos === -1 || timePos === -1) return [];

  // Build lookup: dim position -> { index -> code }
  const dimValueIdAt = (pos, idx) => {
    const vals = obsDims[pos] && obsDims[pos].values;
    if (!vals || !vals[idx]) return null;
    return vals[idx].id != null ? String(vals[idx].id) : String(idx);
  };

  if (layerName === "sea_level") {
    // Gather all observations per country and year
    const valuesByGeoYear = {};
    let maxYear = "1990";

    for (const dataSet of sdmxData.data.dataSets) {
      const obs = dataSet && dataSet.observations;
      if (!obs) continue;

      for (const [keyStr, obsValue] of Object.entries(obs)) {
        const idxs = keyStr.split(":");
        const geoCode = dimValueIdAt(geoPos, Number(idxs[geoPos]));
        const yearCode = dimValueIdAt(timePos, Number(idxs[timePos]));
        if (!geoCode || !yearCode) continue;

        const val = Array.isArray(obsValue) ? obsValue[0] : null;
        if (val === null || val === undefined || Number.isNaN(Number(val))) continue;

        const numVal = Number(val);
        if (!valuesByGeoYear[geoCode]) {
          valuesByGeoYear[geoCode] = {};
        }
        valuesByGeoYear[geoCode][yearCode] = (valuesByGeoYear[geoCode][yearCode] || 0) + numVal;

        if (yearCode > maxYear) {
          maxYear = yearCode;
        }
      }
    }

    // Average the last 10 years of data
    const endYear = parseInt(maxYear, 10);
    const startYear = endYear - 9;

    const observations = [];
    for (const [geoCode, yearsMap] of Object.entries(valuesByGeoYear)) {
      let sum = 0;
      let count = 0;
      for (let y = startYear; y <= endYear; y++) {
        const yStr = String(y);
        if (yearsMap[yStr] !== undefined) {
          sum += yearsMap[yStr];
          count++;
        }
      }

      if (count > 0) {
        observations.push({
          geoPictCode: geoCode,
          value: parseFloat((sum / count).toFixed(4)),
          year: `${startYear}-${endYear}`,
        });
      }
    }
    return observations;
  }

  // Accumulate sum per `${geo}|${year}` and track year per geo.
  const sums = {};
  const latestYearPerGeo = {};

  for (const dataSet of sdmxData.data.dataSets) {
    const obs = dataSet && dataSet.observations;
    if (!obs) continue;

    for (const [keyStr, obsValue] of Object.entries(obs)) {
      const idxs = keyStr.split(":");
      const geoCode = dimValueIdAt(geoPos, Number(idxs[geoPos]));
      const yearCode = dimValueIdAt(timePos, Number(idxs[timePos]));
      if (!geoCode || !yearCode) continue;

      const val = Array.isArray(obsValue) ? obsValue[0] : null;
      if (val === null || val === undefined || Number.isNaN(Number(val))) continue;

      const numVal = Number(val);
      const k = `${geoCode}|${yearCode}`;
      sums[k] = (sums[k] || 0) + numVal;

      const cur = latestYearPerGeo[geoCode];
      if (!cur || String(yearCode) > String(cur)) {
        latestYearPerGeo[geoCode] = yearCode;
      }
    }
  }

  const observations = [];
  for (const [geoCode, year] of Object.entries(latestYearPerGeo)) {
    const value = sums[`${geoCode}|${year}`];
    if (value === undefined) continue;
    observations.push({ geoPictCode: geoCode, value, year });
  }
  return observations;
}
