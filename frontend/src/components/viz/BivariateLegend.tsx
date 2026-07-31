/**
 * The 3×3 bivariate legend — the primary brush control (lab notes:
 * "Bivariate legend is brush and linked to the chart itself"). Per-cell hover
 * and selection filter the map and every linked chart. Break values and units
 * are displayed per axis; the center cell labels the declared norm.
 */
import { useState } from "react";
import { DATAVIZ_TOKENS } from "../../dataviz/constant";
import type { AxisBreaks, ClassificationResult } from "../../dataviz/classify";
import type { BivariateMode } from "../../dataviz/datasetDefinitions";

export interface LegendProps {
  mode: BivariateMode;
  classification: ClassificationResult | null;
  colors: string[][];
  axis1Label: string;
  axis1Units: string;
  axis2Label: string;
  axis2Units: string;
  breaksAxis1: AxisBreaks | null;
  breaksAxis2: AxisBreaks | null;
  selectedClass: number | null;
  hoveredClass: number | null;
  onSelectClass: (classIndex: number | null) => void;
  onHoverClass: (classIndex: number | null) => void;
}

const ROW_LABELS = ["high", "middle", "low"];
const COL_LABELS = ["low", "middle", "high"];

const MODE_LABELS: Record<BivariateMode, string> = {
  "sequential-sequential": "sequential × sequential",
  "diverging-diverging": "diverging × diverging (center = norm)",
  "qualitative-sequential": "qualitative × sequential",
};

export function BivariateLegend({
  mode,
  classification,
  colors,
  axis1Label,
  axis1Units,
  axis2Label,
  axis2Units,
  breaksAxis1,
  breaksAxis2,
  selectedClass,
  hoveredClass,
  onSelectClass,
  onHoverClass,
}: LegendProps) {
  // The legend is the primary brush control: hover affordance is local state
  // so an unrelated parent re-render can never reset it (v1 Patch 2 guard).
  const [localHover, setLocalHover] = useState<number | null>(null);
  const activeHover = hoveredClass ?? localHover;
  const counts = classification?.counts ?? null;

  const formatBreak = (value: number) => {
    if (Math.abs(value) >= 1000) return value.toLocaleString();
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(1);
  };

  const axis1BreakLabel =
    breaksAxis1 && breaksAxis1.edges.length > 0
      ? breaksAxis1.edges.map(formatBreak).join(" – ")
      : null;
  const axis2BreakLabel =
    breaksAxis2 && breaksAxis2.edges.length > 0
      ? breaksAxis2.edges.map(formatBreak).join(" – ")
      : null;
  const normLabel =
    breaksAxis1?.norm !== undefined || breaksAxis2?.norm !== undefined
      ? `center = ${formatBreak(breaksAxis1?.norm ?? (breaksAxis2?.norm as number))}`
      : null;

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
      role="group"
      aria-label="Bivariate legend"
    >
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        Bivariate legend — brush
      </div>
      <div className="mb-2 text-[10px] font-medium text-neutral-400" data-testid="legend-mode">
        {MODE_LABELS[mode]}
      </div>
      <div className="flex items-center gap-2">
        {/* axis 2 label (rows) */}
        <div
          className="w-4 text-[10px] leading-3 text-neutral-500"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          title={`${axis2Label} (${axis2Units})`}
        >
          {axis2Label}
        </div>
        <div>
          {colors.map((row, r) => (
            <div key={r} className="flex" style={{ gap: DATAVIZ_TOKENS.legendCellGap, marginBottom: DATAVIZ_TOKENS.legendCellGap }}>
              {row.map((color, c) => {
                const classIndex = r * 3 + c;
                const isSelected = selectedClass === classIndex;
                const isHovered = activeHover === classIndex;
                const memberCount = counts ? counts[classIndex] : 0;
                const isEmpty = memberCount === 0;
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    data-cell-row={r}
                    data-cell-col={c}
                    data-class-index={classIndex}
                    data-empty={isEmpty || undefined}
                    title={
                      isEmpty
                        ? `No features in this class (${COL_LABELS[c]} ${axis1Label}, ${ROW_LABELS[r]} ${axis2Label})`
                        : `${memberCount} feature(s): ${COL_LABELS[c]} ${axis1Label}, ${ROW_LABELS[r]} ${axis2Label}`
                    }
                    onClick={() => onSelectClass(isSelected ? null : classIndex)}
                    onMouseEnter={() => {
                      onHoverClass(isEmpty ? null : classIndex);
                      setLocalHover(isEmpty ? null : classIndex);
                    }}
                    onMouseLeave={() => {
                      onHoverClass(null);
                      setLocalHover(null);
                    }}
                    aria-pressed={isSelected}
                    aria-label={`Legend cell ${COL_LABELS[c]} ${axis1Label}, ${ROW_LABELS[r]} ${axis2Label}`}
                    className="cursor-pointer border transition-all"
                    style={{
                      width: DATAVIZ_TOKENS.legendCellSize,
                      height: DATAVIZ_TOKENS.legendCellSize,
                      backgroundColor: color,
                      borderColor: isSelected
                        ? "#111827"
                        : isHovered
                          ? "#6b7280"
                          : "#e5e7eb",
                      borderWidth: isSelected ? 3 : 1,
                      boxShadow: isSelected ? "0 0 0 1px #111827" : undefined,
                      opacity: isEmpty ? 0.35 : 1,
                    }}
                  />
                );
              })}
            </div>
          ))}
          {/* axis 1 labels (columns) */}
          <div className="flex" style={{ gap: DATAVIZ_TOKENS.legendCellGap, marginLeft: DATAVIZ_TOKENS.legendCellGap }}>
            {COL_LABELS.map((label) => (
              <div key={label} style={{ width: DATAVIZ_TOKENS.legendCellSize }} className="text-center text-[10px] leading-3 text-neutral-500">
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 space-y-0.5 text-[10px] leading-4 text-neutral-600">
        <div>
          <span className="font-medium">{axis1Label}</span> ({axis1Units})
          {axis1BreakLabel ? ` — ${axis1BreakLabel}` : ""}
        </div>
        <div>
          <span className="font-medium">{axis2Label}</span> ({axis2Units})
          {axis2BreakLabel ? ` — ${axis2BreakLabel}` : ""}
        </div>
        {normLabel && (
          <div data-testid="legend-norm" className="text-neutral-500">
            {normLabel}
          </div>
        )}
      </div>
    </div>
  );
}
