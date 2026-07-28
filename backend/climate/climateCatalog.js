import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CATALOG_DIR = path.join(REPO_ROOT, "data", "catalog");

function readJsonFile(fileName) {
  const filePath = path.join(CATALOG_DIR, fileName);
  const text = fs.readFileSync(filePath, "utf8");
  return JSON.parse(text);
}

export function loadClimateCatalog() {
  return {
    version: "0.1.0",
    generated_from: "data/catalog/*.json",
    thresholds: readJsonFile("climate_thresholds.json"),
    indices: readJsonFile("climate_indices.json"),
    sources: readJsonFile("climate_sources.json"),
  };
}

export function listClimateVariables(catalog = loadClimateCatalog()) {
  return Object.entries(catalog.thresholds.variables).map(
    ([variableId, config]) => ({
      variable_id: variableId,
      label: config.label,
      short_label: config.short_label,
      unit: config.unit,
      thresholds_c: config.thresholds_c,
      default_threshold_c: config.default_threshold_c,
    }),
  );
}

export function getThresholdOptions(variableId, catalog = loadClimateCatalog()) {
  const variable = catalog.thresholds.variables[variableId];
  return variable ? variable.thresholds_c : [];
}

export function getCompatibleMetrics(variableId, catalog = loadClimateCatalog()) {
  return Object.entries(catalog.indices.metrics)
    .filter(([, metric]) => metric.compatible_variables.includes(variableId))
    .map(([metricId, metric]) => ({
      metric_id: metricId,
      label: metric.label,
      description: metric.description,
      requires_threshold: metric.requires_threshold,
      output_unit: metric.output_unit,
      map_value_field: metric.map_value_field,
      parameters: metric.parameters || null,
    }));
}

export default {
  loadClimateCatalog,
  listClimateVariables,
  getThresholdOptions,
  getCompatibleMetrics,
};
