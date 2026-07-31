/**
 * Free exploration (spec: Free Exploration Clears Narrative State). Chapter
 * filters and camera constraints are cleared, while the legend, search, and
 * climate layer toggles remain operable. The Climate Layer Toggles requirement
 * is exercised here: activating a layer sets its Mapbox layout visibility to
 * `visible` and the previous thematic layer to `none`.
 */
import { useDimensions } from "../../hooks/useDimensions";
import { BivariateLegend } from "../viz/BivariateLegend";
import { DistributionHistogram } from "../viz/DistributionHistogram";
import { UncertaintyBoxPlot } from "../viz/UncertaintyBoxPlot";
import { SearchControl } from "../viz/SearchControl";
import { BivariateMapPane } from "../map/BivariateMapPane";
import { CHAPTERS } from "./chapters";
import type { ClassifiedFeature, ClassificationResult } from "../../dataviz/classify";
import type { DatasetDefinition, BivariateMode } from "../../dataviz/datasetDefinitions";
import type { ClimateLayer } from "../../hooks/useMapbox";

export interface ExploreViewProps {
  onReturnToNarrative: () => void;
  mapContainerRef: React.RefObject<HTMLDivElement | null>;
  mapboxMap: import("mapbox-gl").Map | null;
  activeDatasetId: string;
  activeDataset: DatasetDefinition;
  classification: ClassificationResult | null;
  activeFeatures: ClassifiedFeature[];
  mode: BivariateMode;
  palette: string[][];
  error: string | null;
  loading: boolean;
  selectedIds: ReadonlySet<string>;
  hoveredId: string | null;
  onHoverId: (id: string | null) => void;
  onSelectId: (id: string | null) => void;
  selectedClass: number | null;
  onSelectClass: (classIndex: number | null) => void;
  onSearchSelect: (ids: string[]) => void;
  onSearchNoMatch: (query: string) => void;
  activeClimateLayer: ClimateLayer;
  onToggleClimateLayer: (layer: Exclude<ClimateLayer, null>) => void;
  onSelectDataset: (index: number) => void;
}

export function ExploreView({
  onReturnToNarrative,
  mapContainerRef,
  mapboxMap,
  activeDatasetId,
  activeDataset,
  classification,
  activeFeatures,
  mode,
  palette,
  error,
  selectedIds,
  hoveredId,
  onHoverId,
  onSelectId,
  selectedClass,
  onSelectClass,
  onSearchSelect,
  onSearchNoMatch,
  activeClimateLayer,
  onToggleClimateLayer,
  onSelectDataset,
}: ExploreViewProps) {
  const histRef = useDimensions<HTMLDivElement>();
  const axis1 = activeDataset.axis1;
  const axis2 = activeDataset.axis2;

  return (
    <div className="relative flex h-full w-full gap-3 overflow-hidden">
      <main className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
        <BivariateMapPane
          mapContainerRef={mapContainerRef}
          mapboxMap={mapboxMap}
          activeDatasetId={activeDatasetId}
          activeDataset={activeDataset}
          classificationFeatures={activeFeatures}
          selectedIds={selectedIds}
          hoveredId={hoveredId}
          onHoverId={onHoverId}
          onSelectId={onSelectId}
        />
      </main>

      <aside className="flex w-[340px] shrink-0 flex-col gap-3 overflow-y-auto pr-1">
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Free exploration
          </span>
          <button
            type="button"
            onClick={onReturnToNarrative}
            data-testid="return-to-narrative"
            className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            ← Narrative
          </button>
        </div>

        {/* Climate layer toggles (spatial-map-viz: Climate Layer Toggles) */}
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm" data-testid="climate-layer-controls">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Climate layers
          </div>
          <div className="flex gap-2">
            {(["tas", "wet_bulb"] as const).map((layer) => (
              <button
                key={layer}
                type="button"
                onClick={() => onToggleClimateLayer(layer)}
                data-testid={`climate-toggle-${layer}`}
                aria-pressed={activeClimateLayer === layer}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                  activeClimateLayer === layer
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {layer === "tas" ? "Near-surface air temp" : "Wet-bulb temp"}
              </button>
            ))}
          </div>
        </div>

        {/* Dataset selector */}
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Datasets
          </div>
          <div className="flex flex-col gap-1">
            {CHAPTERS.map((chapter, index) => (
              <button
                key={chapter.id}
                type="button"
                onClick={() => onSelectDataset(index)}
                aria-pressed={activeDatasetId === chapter.datasetId}
                className="rounded-lg px-2 py-1.5 text-left text-xs text-neutral-700 transition hover:bg-neutral-100"
              >
                {chapter.title}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div data-testid="classification-error" role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <BivariateLegend
          mode={mode}
          classification={classification}
          colors={palette}
          axis1Label={axis1.label}
          axis1Units={axis1.units}
          axis2Label={axis2.label}
          axis2Units={axis2.units}
          breaksAxis1={classification?.breaksAxis1 ?? null}
          breaksAxis2={classification?.breaksAxis2 ?? null}
          selectedClass={selectedClass}
          hoveredClass={null}
          onSelectClass={onSelectClass}
          onHoverClass={() => {}}
        />

        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <SearchControl
            features={activeFeatures}
            nameKey="name"
            onSelectIds={onSearchSelect}
            onNoMatch={onSearchNoMatch}
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
          <DistributionHistogram
            features={activeFeatures}
            valueKey="axis1Value"
            label={axis1.label}
            units={axis1.units}
            width={Math.max(280, histRef.width)}
            height={180}
            selectedIds={selectedIds}
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
          <UncertaintyBoxPlot
            features={activeFeatures}
            valueKey="axis1Value"
            label={`${axis1.label} — spread`}
            units={axis1.units}
            width={Math.max(280, histRef.width)}
            height={180}
            selectedIds={selectedIds}
            envelopeKeys={axis1.envelope}
          />
        </div>
      </aside>
    </div>
  );
}
