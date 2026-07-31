/**
 * Loads the dataset FeatureCollections and classifies the active dataset in the
 * active mode. All classification is done by the pure `classify()` function;
 * the result feeds the map source, the legend, and the linked charts.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  type ClassifiedFeature,
  type ClassificationResult,
  classify,
} from "../dataviz/classify";
import type { BivariateMode, DatasetDefinition } from "../dataviz/datasetDefinitions";
import { getDatasetDefinition } from "../dataviz/datasetDefinitions";
import { PALETTES } from "../dataviz/paletteCore.js";

export interface BivariateData {
  /** Raw features per dataset id, loaded once. */
  featuresByDataset: Record<string, GeoJSON.Feature[]>;
  /** Classification of the ACTIVE dataset in the ACTIVE mode. */
  classification: ClassificationResult | null;
  activeDataset: DatasetDefinition;
  /** Loud, user-visible classification errors (mixed-scale, ties, missing norm). */
  error: string | null;
  /** True while the active dataset's data is still loading. */
  loading: boolean;
  /** Load (once) and classify the given dataset in the given mode. */
  applyDataset: (datasetId: string, mode: BivariateMode) => Promise<void>;
  /** Reclassify the active dataset in a new mode; fails loudly on unsupported combos. */
  classifyActive: (mode: BivariateMode) => void;
  /** All classified features for the active dataset (map + charts). */
  activeFeatures: ClassifiedFeature[];
  activeMode: BivariateMode;
}

async function fetchFeatures(def: DatasetDefinition): Promise<GeoJSON.Feature[]> {
  const res = await fetch(def.dataUrl);
  if (!res.ok) {
    throw new Error(`Failed to load dataset "${def.title}" from ${def.dataUrl}: HTTP ${res.status}`);
  }
  const geojson = (await res.json()) as GeoJSON.FeatureCollection;
  const features = geojson.features ?? [];

  // Derived property for the Fiji heat pair: year-to-year spread of extreme
  // heat days (`_max − _min`) — inter-annual variability for ONE model
  // (ACCESS-CM2), not model-ensemble uncertainty. Label it accordingly in the UI.
  if (def.id === "fiji-heat-variability") {
    for (const feature of features) {
      const props = feature.properties as Record<string, unknown> | null;
      if (!props) continue;
      const min = Number(props.extreme_heat_days_min ?? 0);
      const max = Number(props.extreme_heat_days_max ?? 0);
      props.extreme_heat_days_spread = max - min;
    }
  }

  return features;
}

export function useBivariateData() {
  const featuresRef = useRef<Record<string, GeoJSON.Feature[]>>({});
  const activeDatasetIdRef = useRef<string>("pict-water-pop");

  const [featuresByDataset, setFeaturesByDataset] = useState<Record<string, GeoJSON.Feature[]>>({});
  const [activeDatasetId, setActiveDatasetIdState] = useState<string>("pict-water-pop");
  const [activeMode, setActiveMode] = useState<BivariateMode>("sequential-sequential");
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const setActiveDatasetId = useCallback((id: string) => {
    activeDatasetIdRef.current = id;
    setActiveDatasetIdState(id);
  }, []);

  const activeDataset = getDatasetDefinition(activeDatasetId);

  const applyDataset = useCallback(async (datasetId: string, mode: BivariateMode) => {
    setLoading(true);
    setError(null);
    try {
      const def = getDatasetDefinition(datasetId);
      let features = featuresRef.current[datasetId];
      if (!features) {
        features = await fetchFeatures(def);
        featuresRef.current = { ...featuresRef.current, [datasetId]: features };
        setFeaturesByDataset(featuresRef.current);
      }
      setActiveDatasetId(datasetId);
      const result = classify(features, def, mode, PALETTES[mode]);
      setActiveMode(mode);
      setClassification(result);
      setError(null);
    } catch (err) {
      // Fail loudly: surface the error, keep the previous encoding intact.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [setActiveDatasetId]);

  const classifyActive = useCallback((nextMode: BivariateMode) => {
    const def = getDatasetDefinition(activeDatasetIdRef.current);
    const features = featuresRef.current[activeDatasetIdRef.current];
    if (!features || features.length === 0) {
      setError(`No data loaded for dataset "${def.id}" — cannot classify.`);
      return;
    }
    try {
      const result = classify(features, def, nextMode, PALETTES[nextMode]);
      setActiveMode(nextMode);
      setClassification(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const activeFeatures = useMemo(
    () => classification?.features ?? [],
    [classification],
  );

  return {
    featuresByDataset,
    classification,
    activeDataset,
    activeFeatures,
    activeMode,
    error,
    loading,
    applyDataset,
    classifyActive,
  };
}
