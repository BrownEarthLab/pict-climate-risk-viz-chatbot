/**
 * Uncertainty box plot: a Tukey box (min, Q1, median, Q3, max) of the active
 * axis value. When the dataset carries per-feature envelope fields (`_min` /
 * `_mean` / `_max` — the Fiji heat layer's uncertainty columns), the envelope
 * renders as a band so the mean and its range are both visible. React renders
 * every mark; D3 computes the scales (architecture.md Decision 1).
 */
import { useMemo } from "react";
import { scaleLinear } from "d3-scale";
import { quantileSorted } from "d3-array";
import { DATAVIZ_TOKENS } from "../../dataviz/constant";
import type { ClassifiedFeature } from "../../dataviz/classify";

export interface BoxPlotProps {
  features: ClassifiedFeature[];
  valueKey: "axis1Value" | "axis2Value";
  label: string;
  units: string;
  width: number;
  height: number;
  selectedIds: ReadonlySet<string>;
  /** Property keys for the per-feature uncertainty envelope, when present. */
  envelopeKeys?: { min: string; mean: string; max: string };
}

interface BoxStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

function boxStats(values: number[]): BoxStats | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    q1: quantileSorted(sorted, 0.25) as number,
    median: quantileSorted(sorted, 0.5) as number,
    q3: quantileSorted(sorted, 0.75) as number,
    max: sorted[sorted.length - 1],
  };
}

export function UncertaintyBoxPlot({
  features,
  valueKey,
  label,
  units,
  width,
  height,
  selectedIds,
  envelopeKeys,
}: BoxPlotProps) {
  const margin = DATAVIZ_TOKENS.chartMargin;
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);
  const bandHeight = Math.min(56, innerHeight * 0.55);
  const bandY = margin.top + (innerHeight - bandHeight) / 2;

  const values = useMemo(() => {
    const nums = features
      .map((f) => (valueKey === "axis1Value" ? f.axis1Value : f.axis2Value))
      .filter((v): v is number => typeof v === "number");
    return nums;
  }, [features, valueKey]);

  const stats = useMemo(() => boxStats(values), [values]);

  const envelope = useMemo(() => {
    if (!envelopeKeys) return null;
    const rows = features
      .map((f) => {
        const props = f.properties as Record<string, unknown>;
        const min = Number(props[envelopeKeys.min]);
        const mean = Number(props[envelopeKeys.mean]);
        const max = Number(props[envelopeKeys.max]);
        if (![min, mean, max].every(Number.isFinite)) return null;
        return { min, mean, max };
      })
      .filter((row): row is { min: number; mean: number; max: number } => row !== null);
    if (rows.length === 0) return null;
    return {
      min: Math.min(...rows.map((r) => r.min)),
      mean: rows.reduce((sum, r) => sum + r.mean, 0) / rows.length,
      max: Math.max(...rows.map((r) => r.max)),
    };
  }, [features, envelopeKeys]);

  const x = useMemo(() => {
    const lo = Math.min(stats?.min ?? 0, envelope?.min ?? stats?.min ?? 0);
    const hi = Math.max(stats?.max ?? 0, envelope?.max ?? stats?.max ?? 0);
    const pad = lo === hi ? 1 : (hi - lo) * 0.05;
    return scaleLinear().domain([lo - pad, hi + pad]).nice().range([margin.left, width - margin.right]);
  }, [stats, envelope, margin.left, margin.right, width]);

  const ticks = useMemo(() => x.ticks(5), [x]);

  if (!stats) {
    return (
      <svg width={width} height={height} role="img" aria-label={`${label} box plot`}>
        <text x={margin.left} y={margin.top + 10} fontSize={DATAVIZ_TOKENS.panelTitleSize} fontWeight={600} fill="#111827">
          {label}
        </text>
        <text x={margin.left} y={margin.top + 30} fontSize={DATAVIZ_TOKENS.tickLabelSize} fill={DATAVIZ_TOKENS.axisColor}>
          No numeric values in the active selection.
        </text>
      </svg>
    );
  }

  return (
    <svg width={width} height={height} role="img" aria-label={`${label} box plot`}>
      <text x={margin.left} y={margin.top - 4} fontSize={DATAVIZ_TOKENS.panelTitleSize} fontWeight={600} fill="#111827">
        {label}
      </text>

      {/* uncertainty envelope band (min–max with the mean marked) */}
      {envelope && (
        <g>
          <rect
            x={x(envelope.min)}
            y={bandY - 10}
            width={Math.max(2, x(envelope.max) - x(envelope.min))}
            height={bandHeight + 20}
            fill="#93c5fd"
            opacity={0.35}
            rx={2}
          />
          <line
            x1={x(envelope.min)}
            x2={x(envelope.max)}
            y1={bandY + bandHeight / 2}
            y2={bandY + bandHeight / 2}
            stroke="#3b82f6"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
          <line
            x1={x(envelope.mean)}
            x2={x(envelope.mean)}
            y1={bandY - 10}
            y2={bandY + bandHeight + 10}
            stroke="#1d4ed8"
            strokeWidth={2}
          />
        </g>
      )}

      {/* box + whiskers */}
      <g>
        <line x1={x(stats.min)} x2={x(stats.max)} y1={bandY + bandHeight / 2} y2={bandY + bandHeight / 2} stroke="#111827" strokeWidth={1.5} />
        <line x1={x(stats.min)} x2={x(stats.min)} y1={bandY + bandHeight / 2 - 8} y2={bandY + bandHeight / 2 + 8} stroke="#111827" strokeWidth={1.5} />
        <line x1={x(stats.max)} x2={x(stats.max)} y1={bandY + bandHeight / 2 - 8} y2={bandY + bandHeight / 2 + 8} stroke="#111827" strokeWidth={1.5} />
        <rect
          x={x(stats.q1)}
          y={bandY}
          width={Math.max(1, x(stats.q3) - x(stats.q1))}
          height={bandHeight}
          fill={selectedIds.size > 0 ? DATAVIZ_TOKENS.unselectedMarkColor : DATAVIZ_TOKENS.selectedMarkColor}
          opacity={selectedIds.size > 0 ? 0.5 : 1}
          stroke="#111827"
          strokeWidth={1.5}
        />
        <line x1={x(stats.median)} x2={x(stats.median)} y1={bandY} y2={bandY + bandHeight} stroke="#111827" strokeWidth={2} />
      </g>

      {/* selected subset stats */}
      {selectedIds.size > 0 && (() => {
        const selValues = features
          .filter((f) => selectedIds.has(f.id))
          .map((f) => (valueKey === "axis1Value" ? f.axis1Value : f.axis2Value))
          .filter((v): v is number => typeof v === "number");
        const sel = boxStats(selValues);
        if (!sel) return null;
        return (
          <g>
            <rect x={x(sel.q1)} y={bandY - 16} width={Math.max(1, x(sel.q3) - x(sel.q1))} height={14} fill={DATAVIZ_TOKENS.selectedMarkColor} opacity={0.85} />
            <line x1={x(sel.median)} x2={x(sel.median)} y1={bandY - 16} y2={bandY - 2} stroke="#ffffff" strokeWidth={1.5} />
          </g>
        );
      })()}

      {ticks.map((t) => (
        <g key={`bx-${t}`}>
          <line x1={x(t)} x2={x(t)} y1={margin.top} y2={margin.top + innerHeight} stroke={DATAVIZ_TOKENS.gridColor} strokeWidth={1} />
          <text x={x(t)} y={margin.top + innerHeight + 14} fontSize={DATAVIZ_TOKENS.tickLabelSize} fill={DATAVIZ_TOKENS.axisColor} textAnchor="middle">
            {t}
          </text>
        </g>
      ))}
      <text x={margin.left} y={height - 2} fontSize={DATAVIZ_TOKENS.axisLabelSize} fill={DATAVIZ_TOKENS.axisColor}>
        {label} ({units})
      </text>
    </svg>
  );
}
