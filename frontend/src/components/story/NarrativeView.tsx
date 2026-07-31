/**
 * The narrative view: the map on the left, and beside it the chapter deck, the
 * bivariate legend (the primary brush control), the linked charts, and the
 * search control. Exactly one thematic encoding is visible at a time.
 */
import type { Chapter } from "./chapters";
import { ChapterDeck } from "./ChapterDeck";
import { BivariateLegend } from "../viz/BivariateLegend";
import { DistributionHistogram } from "../viz/DistributionHistogram";
import { UncertaintyBoxPlot } from "../viz/UncertaintyBoxPlot";
import { SearchControl } from "../viz/SearchControl";
import { BivariateMapPane } from "../map/BivariateMapPane";
import { useDimensions } from "../../hooks/useDimensions";
import type { ClassifiedFeature, ClassificationResult } from "../../dataviz/classify";
import type { DatasetDefinition } from "../../dataviz/datasetDefinitions";
import type { BivariateMode } from "../../dataviz/datasetDefinitions";
import type { AxisBreaks } from "../../dataviz/classify";

export interface NarrativeViewProps {
  chapters: Chapter[];
  activeChapterIndex: number;
  onSelectChapter: (index: number) => void;
  onExitExplore: () => void;

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
  hoveredClass: number | null;
  onSelectClass: (classIndex: number | null) => void;
  onHoverClass: (classIndex: number | null) => void;
  onSearchSelect: (ids: string[]) => void;
  onSearchNoMatch: (query: string) => void;
}

export function NarrativeView({
  chapters,
  activeChapterIndex,
  onSelectChapter,
  onExitExplore,
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
  hoveredClass,
  onSelectClass,
  onHoverClass,
  onSearchSelect,
  onSearchNoMatch,
}: NarrativeViewProps) {
  const legendRef = useDimensions<HTMLDivElement>();
  const histRef = useDimensions<HTMLDivElement>();

  const axis1 = activeDataset.axis1;
  const axis2 = activeDataset.axis2;

  const breaksAxis1: AxisBreaks | null = classification?.breaksAxis1 ?? null;
  const breaksAxis2: AxisBreaks | null = classification?.breaksAxis2 ?? null;

  return (
    <div className="relative flex h-full w-full gap-3 overflow-hidden">
      {/* Map */}
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

      {/* Sidebar: deck, legend, charts, search */}
      <aside className="flex w-[340px] shrink-0 flex-col gap-3 overflow-y-auto pr-1">
        <ChapterDeck chapters={chapters} activeIndex={activeChapterIndex} onSelectChapter={onSelectChapter} />

        <button
          type="button"
          onClick={onExitExplore}
          data-testid="free-exploration"
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left text-xs font-medium text-neutral-600 shadow-sm transition hover:bg-neutral-50"
        >
          Exit narrative — free exploration
        </button>

        {error && (
          <div
            data-testid="classification-error"
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {error}
          </div>
        )}

        <div ref={legendRef.ref}>
          <BivariateLegend
            mode={mode}
            classification={classification}
            colors={palette}
            axis1Label={axis1.label}
            axis1Units={axis1.units}
            axis2Label={axis2.label}
            axis2Units={axis2.units}
            breaksAxis1={breaksAxis1}
            breaksAxis2={breaksAxis2}
            selectedClass={selectedClass}
            hoveredClass={hoveredClass}
            onSelectClass={onSelectClass}
            onHoverClass={onHoverClass}
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <SearchControl
            features={activeFeatures}
            nameKey="name"
            onSelectIds={onSearchSelect}
            onNoMatch={onSearchNoMatch}
          />
        </div>

        <div ref={histRef.ref} className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
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
