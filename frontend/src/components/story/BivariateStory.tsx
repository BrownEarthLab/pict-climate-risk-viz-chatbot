/**
 * The story owner (architecture.md Decision 2): holds `mode`, `selectedClass`,
 * `selectedIds`, `hoveredId`, and the active chapter, passing them down as
 * props. No store, no source attribution. Chapter presets (encoding + camera +
 * legend mode) are applied ONLY in the chapter-change handler — never in an
 * effect keyed on unstable deps (v1 Patch 2 regression guard).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMapbox, type ClimateLayer } from "../../hooks/useMapbox";
import { useBivariateData } from "../../hooks/useBivariateData";
import { classify } from "../../dataviz/classify";
import { DATASET_DEFINITIONS } from "../../dataviz/datasetDefinitions";
import { PALETTES } from "../../dataviz/paletteCore.js";
import { CHAPTERS, type Chapter } from "./chapters";
import { SplashView } from "./SplashView";
import { NarrativeView } from "./NarrativeView";
import { ExploreView } from "./ExploreView";

type View = "splash" | "narrative" | "explore";

export function BivariateStory() {
  const {
    mapContainerRef,
    mapboxMap,
    activeLayer,
    setActiveLayer,
    showGlobalDataset,
    setShowGlobalDataset,
    activeDatasetId: mapActiveDatasetId,
    setActiveDatasetId: setMapActiveDatasetId,
  } = useMapbox();

  const {
    classification,
    activeDataset,
    activeFeatures,
    activeMode,
    error,
    loading,
    applyDataset,
  } = useBivariateData();

  const [view, setView] = useState<View>("splash");
  const [chapterIndex, setChapterIndex] = useState(0);
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const activeChapter = CHAPTERS[chapterIndex];

  const classificationRef = useRef(classification);
  useEffect(() => {
    classificationRef.current = classification;
  }, [classification]);

  /**
   * Apply a chapter: replace the active encoding (dataset + mode), apply its
   * camera, clear the previous selection. Called ONLY from user chapter
   * navigation — re-entering a chapter reapplies its declared state.
   */
  const applyChapter = useCallback(
    async (chapter: Chapter) => {
      setSelectedClass(null);
      setSelectedIds(new Set());
      await applyDataset(chapter.datasetId, chapter.mode);
      setMapActiveDatasetId(chapter.datasetId);
      setActiveLayer(null);
      setShowGlobalDataset(false);
      if (mapboxMap) {
        mapboxMap.flyTo({
          center: chapter.camera.center,
          zoom: chapter.camera.zoom,
          duration: 800,
        });
      }
    },
    [applyDataset, setMapActiveDatasetId, setActiveLayer, setShowGlobalDataset, mapboxMap],
  );

  const handleEnter = useCallback(() => {
    setView("narrative");
    void applyChapter(CHAPTERS[0]);
  }, [applyChapter]);

  const handleSelectChapter = useCallback(
    (index: number) => {
      setChapterIndex(index);
      void applyChapter(CHAPTERS[index]);
    },
    [applyChapter],
  );

  const handleExitExplore = useCallback(() => {
    // Free exploration: no chapter-imposed selection or camera constraint.
    setView("explore");
    setSelectedClass(null);
    setSelectedIds(new Set());
  }, []);

  const handleReturnToNarrative = useCallback(() => {
    setView("narrative");
    void applyChapter(activeChapter);
  }, [activeChapter, applyChapter]);

  // ---- Legend selection (7.5: re-select-to-clear) ----
  const handleSelectClass = useCallback(
    (classIndex: number | null) => {
      if (classIndex === null || classIndex === selectedClass) {
        setSelectedClass(null);
        setSelectedIds(new Set());
        return;
      }
      setSelectedClass(classIndex);
      const members = (classificationRef.current?.features ?? [])
        .filter((f) => f.classIndex === classIndex)
        .map((f) => f.id);
      setSelectedIds(new Set(members));
    },
    [selectedClass],
  );

  const handleHoverClass = useCallback(() => {
    // Legend hover is handled inside the legend itself; the owner does not
    // need to lift it. Exists so the narrative contract is explicit.
  }, []);

  const handleSearchSelect = useCallback((ids: string[]) => {
    setSelectedClass(null);
    setSelectedIds(new Set(ids));
  }, []);

  const handleSearchNoMatch = useCallback(() => {
    // Report handled by SearchControl; leave the existing selection intact.
  }, []);

  const handleMapSelectId = useCallback((id: string | null) => {
    setSelectedClass(null);
    setSelectedIds((prev) => {
      if (id === null) return new Set();
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ---- Climate layer toggles (explore view) ----
  const handleToggleClimateLayer = useCallback(
    (layer: Exclude<ClimateLayer, null>) => {
      const isGlobal = layer === "tas" || layer === "wet_bulb";
      if (activeLayer === layer && showGlobalDataset === isGlobal) {
        setActiveLayer(null);
        setShowGlobalDataset(false);
        setMapActiveDatasetId(activeDataset.id);
        return;
      }
      setActiveLayer(layer);
      setShowGlobalDataset(isGlobal);
      setMapActiveDatasetId(null);
    },
    [activeLayer, showGlobalDataset, setActiveLayer, setShowGlobalDataset, setMapActiveDatasetId, activeDataset],
  );

  // First chapter loads on mount so the map has data on a cold load.
  useEffect(() => {
    void applyDataset(CHAPTERS[0].datasetId, CHAPTERS[0].mode);
    setMapActiveDatasetId(CHAPTERS[0].datasetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Verification handle: exposes the pure classification functions so tests
  // can assert against the module contract (mixed-scale rejection, loud
  // tie failures) from the browser context.
  useEffect(() => {
    (window as any).__bivariate = {
      classify,
      datasetDefinitions: DATASET_DEFINITIONS,
      chapters: CHAPTERS,
    };
    return () => {
      delete (window as any).__bivariate;
    };
  }, []);

  const splashSearchFeatures = useMemo(
    () => activeFeatures.map((f) => ({ id: f.id, properties: f.properties })),
    [activeFeatures],
  );

  const palette = PALETTES[activeMode];

  // The map (and its control surface) is ALWAYS mounted so a cold load
  // initializes the map and feeds the first chapter's data before any
  // interaction — the splash is an overlay on top of it.
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#f8f6f1]">
      {view === "explore" ? (
        <ExploreView
          onReturnToNarrative={handleReturnToNarrative}
          mapContainerRef={mapContainerRef}
          mapboxMap={mapboxMap}
          activeDatasetId={mapActiveDatasetId ?? activeDataset.id}
          activeDataset={activeDataset}
          classification={classification}
          activeFeatures={activeFeatures}
          mode={activeMode}
          palette={palette}
          error={error}
          loading={loading}
          selectedIds={selectedIds}
          hoveredId={hoveredId}
          onHoverId={setHoveredId}
          onSelectId={handleMapSelectId}
          selectedClass={selectedClass}
          onSelectClass={handleSelectClass}
          onSearchSelect={handleSearchSelect}
          onSearchNoMatch={handleSearchNoMatch}
          activeClimateLayer={activeLayer}
          onToggleClimateLayer={handleToggleClimateLayer}
          onSelectDataset={handleSelectChapter}
        />
      ) : (
        <NarrativeView
          chapters={CHAPTERS}
          activeChapterIndex={chapterIndex}
          onSelectChapter={handleSelectChapter}
          onExitExplore={handleExitExplore}
          mapContainerRef={mapContainerRef}
          mapboxMap={mapboxMap}
          activeDatasetId={mapActiveDatasetId ?? activeDataset.id}
          activeDataset={activeDataset}
          classification={classification}
          activeFeatures={activeFeatures}
          mode={activeMode}
          palette={palette}
          error={error}
          loading={loading}
          selectedIds={selectedIds}
          hoveredId={hoveredId}
          onHoverId={setHoveredId}
          onSelectId={handleMapSelectId}
          selectedClass={selectedClass}
          hoveredClass={null}
          onSelectClass={handleSelectClass}
          onHoverClass={handleHoverClass}
          onSearchSelect={handleSearchSelect}
          onSearchNoMatch={handleSearchNoMatch}
        />
      )}

      {view === "splash" && (
        <SplashView
          onEnter={handleEnter}
          searchFeatures={splashSearchFeatures}
          nameKey="name"
          onSelectIds={handleSearchSelect}
          onNoMatch={handleSearchNoMatch}
        />
      )}
    </div>
  );
}
