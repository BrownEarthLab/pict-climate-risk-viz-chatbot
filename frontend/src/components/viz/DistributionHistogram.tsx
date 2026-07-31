/**
 * Distribution histogram. React renders every mark; D3 (`d3-array` bin +
 * `d3-scale`) computes only (architecture.md Decision 1). No selectAll, no SVG
 * ref — a re-render can never delete a mark the pointer is interacting with.
 */
import { useMemo } from "react";
import { bin } from "d3-array";
import { scaleLinear } from "d3-scale";
import { DATAVIZ_TOKENS } from "../../dataviz/constant";
import type { ClassifiedFeature } from "../../dataviz/classify";

export interface HistogramProps {
  features: ClassifiedFeature[];
  valueKey: "axis1Value" | "axis2Value";
  label: string;
  units: string;
  width: number;
  height: number;
  selectedIds: ReadonlySet<string>;
}

export function DistributionHistogram({
  features,
  valueKey,
  label,
  units,
  width,
  height,
  selectedIds,
}: HistogramProps) {
  const margin = DATAVIZ_TOKENS.chartMargin;
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  const values = useMemo(() => {
    const nums = features
      .map((f) => (valueKey === "axis1Value" ? f.axis1Value : f.axis2Value))
      .filter((v): v is number => typeof v === "number");
    return nums.length > 0 ? nums : [0];
  }, [features, valueKey]);

  const { bins, x, y } = useMemo(() => {
    const [min, max] = [Math.min(...values), Math.max(...values)];
    const pad = min === max ? 1 : (max - min) * 0.05;
    const xScale = scaleLinear().domain([min - pad, max + pad]).nice().range([0, innerWidth]);
    const binner = bin<number, number>()
      .domain(xScale.domain() as [number, number])
      .thresholds(10);
    const binsResult = binner(values);
    const yScale = scaleLinear()
      .domain([0, Math.max(1, ...binsResult.map((b) => b.length))])
      .nice()
      .range([innerHeight, 0]);
    return { bins: binsResult, x: xScale, y: yScale };
  }, [values, innerWidth, innerHeight]);

  // Partition selected from unselected (spec: charts show the subset distinctly).
  const selectedCounts = useMemo(() => {
    const counts = new Array(bins.length).fill(0);
    for (const f of features) {
      const v = valueKey === "axis1Value" ? f.axis1Value : f.axis2Value;
      if (typeof v !== "number" || !selectedIds.has(f.id)) continue;
      for (let i = 0; i < bins.length; i++) {
        if (v >= (bins[i].x0 as number) && v < (bins[i].x1 as number)) {
          counts[i] += 1;
          break;
        }
      }
    }
    return counts;
  }, [bins, features, selectedIds, valueKey]);

  const tickValues = useMemo(() => x.ticks(5), [x]);

  return (
    <svg width={width} height={height} role="img" aria-label={`${label} distribution histogram`}>
      <text
        x={margin.left}
        y={margin.top - 4}
        fontSize={DATAVIZ_TOKENS.panelTitleSize}
        fontWeight={600}
        fill="#111827"
      >
        {label} distribution
      </text>
      {/* gridlines */}
      {y.ticks(4).map((t) => (
        <line
          key={`g-${t}`}
          x1={margin.left}
          x2={width - margin.right}
          y1={margin.top + y(t)}
          y2={margin.top + y(t)}
          stroke={DATAVIZ_TOKENS.gridColor}
          strokeWidth={1}
        />
      ))}
      {bins.map((b, i) => {
        const isSelected = selectedCounts[i] > 0;
        return (
          <rect
            key={`b-${i}`}
            x={margin.left + (x(b.x0 as number) ?? 0) + DATAVIZ_TOKENS.markGap / 2}
            y={margin.top + y(b.length)}
            width={Math.max(0, (x(b.x1 as number) ?? innerWidth) - (x(b.x0 as number) ?? 0) - DATAVIZ_TOKENS.markGap)}
            height={Math.max(0, innerHeight - y(b.length))}
            fill={isSelected ? DATAVIZ_TOKENS.selectedMarkColor : DATAVIZ_TOKENS.unselectedMarkColor}
            opacity={selectedIds.size > 0 && !isSelected ? 0.35 : 1}
            rx={1}
          />
        );
      })}
      {tickValues.map((t) => (
        <g key={`x-${t}`}>
          <line
            x1={margin.left + (x(t) ?? 0)}
            x2={margin.left + (x(t) ?? 0)}
            y1={margin.top}
            y2={margin.top + innerHeight}
            stroke={DATAVIZ_TOKENS.gridColor}
            strokeWidth={1}
          />
          <text
            x={margin.left + (x(t) ?? 0)}
            y={margin.top + innerHeight + 14}
            fontSize={DATAVIZ_TOKENS.tickLabelSize}
            fill={DATAVIZ_TOKENS.axisColor}
            textAnchor="middle"
          >
            {t}
          </text>
        </g>
      ))}
      <text
        x={margin.left}
        y={height - 2}
        fontSize={DATAVIZ_TOKENS.axisLabelSize}
        fill={DATAVIZ_TOKENS.axisColor}
      >
        {label} ({units})
      </text>
    </svg>
  );
}
