import {
  loadClimateCatalog,
  listClimateVariables,
  getCompatibleMetrics,
} from "../backend/climate/climateCatalog.js";

const catalog = loadClimateCatalog();

console.log("\nClimate catalog loaded");
console.log("----------------------");
console.log(`Catalog version: ${catalog.version}`);

console.log("\nVariables + approved thresholds");
console.log("--------------------------------");
for (const variable of listClimateVariables(catalog)) {
  console.log(
    `${variable.variable_id} (${variable.short_label}): ${variable.thresholds_c.join(", ")} ${variable.unit}`,
  );
}

console.log("\nTime windows");
console.log("------------");
for (const [windowId, windowConfig] of Object.entries(
  catalog.indices.time_windows,
)) {
  console.log(`${windowId}: ${windowConfig.label} — ${windowConfig.display_hint}`);
}

console.log("\nMVP metrics");
console.log("-----------");
for (const metricId of catalog.indices.mvp_metrics) {
  const metric = catalog.indices.metrics[metricId];
  console.log(`${metricId}: ${metric.label} (${metric.output_unit})`);
}

console.log("\nCompatible metrics by variable");
console.log("------------------------------");
for (const variable of listClimateVariables(catalog)) {
  const metrics = getCompatibleMetrics(variable.variable_id, catalog);
  console.log(
    `${variable.variable_id}: ${metrics.map((metric) => metric.metric_id).join(", ")}`,
  );
}

console.log("\nDatasets");
console.log("--------");
for (const dataset of catalog.sources.datasets) {
  console.log(`${dataset.dataset_id}: ${dataset.status}`);
}
