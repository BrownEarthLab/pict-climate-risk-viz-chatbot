import { useState, useCallback, useRef } from "react";

export type BrushingSource = "MAP" | "CHART" | "STORY" | null;

export interface BrushRange {
  tempMin?: number;
  tempMax?: number;
  popMin?: number;
  popMax?: number;
}

export interface BrushingState {
  selectedIds: Set<string>;
  hoveredId: string | null;
  activeChapter: number | null;
  brushRange: BrushRange | null;
  source: BrushingSource;
}

export function useBrushingState() {
  const [state, setState] = useState<BrushingState>({
    selectedIds: new Set<string>(),
    hoveredId: null,
    activeChapter: null,
    brushRange: null,
    source: null,
  });

  const rafRef = useRef<number | null>(null);
  const pendingStateRef = useRef<Partial<BrushingState> | null>(null);

  // Throttled setter using requestAnimationFrame for 60fps interaction loops
  const updateBrushingState = useCallback((update: Partial<BrushingState>) => {
    pendingStateRef.current = { ...pendingStateRef.current, ...update };

    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        if (pendingStateRef.current) {
          setState((prev) => ({
            ...prev,
            ...pendingStateRef.current,
            selectedIds: pendingStateRef.current?.selectedIds ?? prev.selectedIds,
          }));
          pendingStateRef.current = null;
        }
        rafRef.current = null;
      });
    }
  }, []);

  const setSelectedIds = useCallback((ids: Set<string>, source: BrushingSource = "CHART") => {
    updateBrushingState({ selectedIds: ids, source });
  }, [updateBrushingState]);

  const setHoveredId = useCallback((id: string | null, source: BrushingSource = "MAP") => {
    updateBrushingState({ hoveredId: id, source });
  }, [updateBrushingState]);

  const setActiveChapter = useCallback((chapter: number | null) => {
    updateBrushingState({ activeChapter: chapter, source: "STORY" });
  }, [updateBrushingState]);

  const setBrushRange = useCallback((range: BrushRange | null, source: BrushingSource = "CHART") => {
    updateBrushingState({ brushRange: range, source });
  }, [updateBrushingState]);

  const clearSelection = useCallback(() => {
    updateBrushingState({
      selectedIds: new Set<string>(),
      hoveredId: null,
      brushRange: null,
      source: null,
    });
  }, [updateBrushingState]);

  return {
    ...state,
    updateBrushingState,
    setSelectedIds,
    setHoveredId,
    setActiveChapter,
    setBrushRange,
    clearSelection,
  };
}
