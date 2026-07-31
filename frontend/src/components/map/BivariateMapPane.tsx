/**
 * The map pane for the bivariate narrative. Owns the Mapbox canvas, feeds the
 * classified features into the active dataset's GeoJSON source (with the
 * highlight/hover colours the paint reads via `["feature-state", ...]`), and
 * applies selection/hover through `map.setFeatureState` — the one imperative
 * write path the architecture permits (architecture.md Decision 5).
 */
import { useEffect, useRef, useState } from "react";
import type { ClassifiedFeature } from "../../dataviz/classify";
import type { DatasetDefinition } from "../../dataviz/datasetDefinitions";
import { darken, lighten } from "../../dataviz/paletteCore.js";
import { bivariateLayerId, bivariateSourceId } from "../../hooks/useMapbox";
import { Tooltip, type TooltipPayload } from "../viz/Tooltip";

const NO_DATA_COLOR = "#e0e0e0";

export interface BivariateMapPaneProps {
  mapContainerRef: React.RefObject<HTMLDivElement | null>;
  mapboxMap: mapboxgl.Map | null;
  activeDatasetId: string;
  activeDataset: DatasetDefinition;
  classificationFeatures: ClassifiedFeature[];
  selectedIds: ReadonlySet<string>;
  hoveredId: string | null;
  onHoverId: (id: string | null) => void;
  onSelectId: (id: string | null) => void;
}

interface TooltipState {
  payload: TooltipPayload;
  x: number;
  y: number;
}

function buildTooltipPayload(
  feature: ClassifiedFeature,
  dataset: DatasetDefinition,
): TooltipPayload {
  const props = feature.properties as Record<string, unknown>;
  const name = String(props.name ?? props[dataset.featureIdKey] ?? "Feature");
  const axis1 = dataset.axis1;
  const axis2 = dataset.axis2;

  const fields: { label: string; value: string }[] = [];
  const formatNumber = (value: number | null) =>
    value === null ? "no data" : Number.isInteger(value) ? String(value) : value.toFixed(2);

  if (axis1.categories) {
    fields.push({ label: axis1.label, value: String(feature.axis1Value ?? "no data") });
  } else {
    fields.push({ label: axis1.label, value: `${formatNumber(feature.axis1Value as number | null)} ${axis1.units}`.trim() });
  }
  fields.push({ label: axis2.label, value: `${formatNumber(feature.axis2Value)} ${axis2.units}`.trim() });

  return { title: name, fields, source: dataset.source };
}

export function BivariateMapPane({
  mapContainerRef,
  mapboxMap,
  activeDatasetId,
  activeDataset,
  classificationFeatures,
  selectedIds,
  hoveredId,
  onHoverId,
  onSelectId,
}: BivariateMapPaneProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const appliedSourceRef = useRef<string | null>(null);

  // Keep hovered id in a ref so event handlers never capture stale state.
  useEffect(() => {
    hoveredIdRef.current = hoveredId;
  }, [hoveredId]);
  useEffect(() => {
    setTooltip(null);
  }, [activeDatasetId]);

  // Feed classified features into the active dataset's GeoJSON source. The
  // fill paint reads `fill_color` (class colour) plus the feature-state-driven
  // highlight/hover colours (spec: Highlighting Uses Mapbox Feature State).
  useEffect(() => {
    if (!mapboxMap) return;
    const source = mapboxMap.getSource(bivariateSourceId(activeDatasetId)) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    const features = classificationFeatures.map((feature) => {
      const fillColor = feature.fillColor ?? NO_DATA_COLOR;
      return {
        type: "Feature" as const,
        id: feature.id,
        geometry: feature.geometry,
        properties: {
          ...feature.properties,
          id: feature.id,
          fill_color: fillColor,
          highlight_color: darken(fillColor, 0.25),
          hover_color: lighten(fillColor, 0.35),
        },
      };
    });

    source.setData({
      type: "FeatureCollection",
      features: features as GeoJSON.Feature[],
    });
  }, [mapboxMap, activeDatasetId, classificationFeatures]);

  // Selection → feature-state. Clears stale state when the selection changes
  // or clears, and when the active dataset changes (7.3). The pane may mount
  // fresh (e.g. narrative → explore), so the source's feature state is fully
  // cleared on mount and on dataset change before the new selection applies.
  useEffect(() => {
    if (!mapboxMap) return;
    const sourceId = bivariateSourceId(activeDatasetId);
    const next = selectedIds;
    const prev = selectedIdsRef.current;
    selectedIdsRef.current = new Set(next);

    if (appliedSourceRef.current && appliedSourceRef.current !== sourceId) {
      mapboxMap.removeFeatureState({ source: appliedSourceRef.current });
    }
    if (!appliedSourceRef.current) {
      // Fresh mount: drop any state a previous pane left on this source.
      mapboxMap.removeFeatureState({ source: sourceId });
    }
    appliedSourceRef.current = sourceId;

    for (const id of next) {
      mapboxMap.setFeatureState({ source: sourceId, id }, { highlighted: true });
    }
    for (const id of prev) {
      if (!next.has(id)) {
        mapboxMap.setFeatureState({ source: sourceId, id }, { highlighted: false });
      }
    }
  }, [mapboxMap, activeDatasetId, selectedIds]);

  // Hover → feature-state + tooltip.
  useEffect(() => {
    if (!mapboxMap) return;
    const layerId = bivariateLayerId(activeDatasetId);
    if (!mapboxMap.getLayer(layerId)) return;

    const handleMouseMove = (event: mapboxgl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature || typeof feature.id !== "string") {
        onHoverId(null);
        return;
      }
      onHoverId(feature.id);
      mapboxMap.setFeatureState({ source: bivariateSourceId(activeDatasetId), id: feature.id }, { hovered: true });
      const classified = classificationFeatures.find((f) => f.id === feature.id);
      if (classified) {
        setTooltip({
          payload: buildTooltipPayload(classified, activeDataset),
          x: event.originalEvent.clientX,
          y: event.originalEvent.clientY,
        });
        (mapboxMap.getCanvas().style as CSSStyleDeclaration).cursor = "pointer";
      }
    };

    const clearHover = () => {
      if (hoveredIdRef.current) {
        mapboxMap.setFeatureState(
          { source: bivariateSourceId(activeDatasetId), id: hoveredIdRef.current },
          { hovered: false },
        );
      }
      onHoverId(null);
      setTooltip(null);
      (mapboxMap.getCanvas().style as CSSStyleDeclaration).cursor = "";
    };

    const handleClick = (event: mapboxgl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature || typeof feature.id !== "string") return;
      onSelectId(feature.id);
    };

    mapboxMap.on("mousemove", layerId, handleMouseMove);
    mapboxMap.on("mouseleave", layerId, clearHover);
    mapboxMap.on("click", layerId, handleClick);
    return () => {
      mapboxMap.off("mousemove", layerId, handleMouseMove);
      mapboxMap.off("mouseleave", layerId, clearHover);
      mapboxMap.off("click", layerId, handleClick);
    };
  }, [mapboxMap, activeDatasetId, classificationFeatures, activeDataset, onHoverId, onSelectId]);

  return (
    <div className="relative h-full w-full">
      {/* Inline styles: mapbox-gl's `.mapboxgl-map` CSS sets position:relative,
          which would otherwise override Tailwind's `absolute inset-0` and
          collapse the container to height 0. */}
      <div
        ref={mapContainerRef}
        data-testid="bivariate-map"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {!mapboxMap && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 text-sm text-neutral-500">
          Loading map…
        </div>
      )}
      <Tooltip payload={tooltip?.payload ?? null} x={tooltip?.x ?? 0} y={tooltip?.y ?? 0} />
    </div>
  );
}
