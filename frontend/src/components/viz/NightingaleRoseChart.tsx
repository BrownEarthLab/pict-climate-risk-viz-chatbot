/**
 * Nightingale rose chart (tasks.md 4.1; research.md — `scaleRadial` finding):
 * a polar AREA chart — value encoded as area, all sectors equal angle. D3
 * computes the scales and the arc geometry; React renders every mark
 * (the sibling change's architecture.md Decision 1: no imperative DOM
 * ownership, no SVG ref for rendering).
 *
 * The encoding-honesty contract (tests.md "Rose chart encoding honesty"):
 * two petals whose values differ by a factor of two must have AREAS that
 * differ by ~2x, not ~4x. That is exactly what `d3.scaleRadial` provides —
 * radius maps to the square root of value, so area is proportional to value
 * — and what `scaleLinear` on a radius would break (exaggerating large
 * values by roughly their square).
 *
 * Shared source (Decision 5): the same module the workbench imports is the
 * one the application will import when real data lands (issue #10).
 */
import { useMemo } from "react";
import { scaleBand, scaleRadial } from "d3-scale";
import { arc } from "d3-shape";

export interface RoseDatum {
  /** Axis label — a category or indicator dimension. */
  axis: string;
  value: number;
}

interface RoseArcDatum {
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
}

export interface NightingaleRoseChartProps {
  data: RoseDatum[];
  width: number;
  height: number;
  title?: string;
  fixtureWatermark?: string;
}

export function NightingaleRoseChart({ data, width, height, title, fixtureWatermark }: NightingaleRoseChartProps) {
  const radius = Math.max(0, Math.min(width, height) / 2 - 44);
  const center = { x: width / 2, y: height / 2 };

  // Equal angular width per axis: `scaleBand().range([0, 2π])`.
  const angle = useMemo(
    () => scaleBand<string>().domain(data.map((d) => d.axis)).range([0, 2 * Math.PI]).padding(0.03),
    [data],
  );

  // Area-honest radius: `d3.scaleRadial`, not `scaleLinear` (research.md).
  const radial = useMemo(() => {
    const max = Math.max(0, ...data.map((d) => d.value));
    return scaleRadial<number, number>().domain([0, max || 1]).range([0, radius]);
  }, [data, radius]);

  const petalArc = useMemo(() => arc<RoseArcDatum>(), []);

  const petals = data.map((d) => {
    const start = angle(d.axis) ?? 0;
    return {
      datum: d,
      start,
      end: start + angle.bandwidth(),
      mid: start + angle.bandwidth() / 2,
      outerRadius: radial(d.value),
      path: petalArc({
        startAngle: start,
        endAngle: start + angle.bandwidth(),
        innerRadius: 0,
        outerRadius: radial(d.value),
      }),
    };
  });

  const labelRadius = radius + 16;

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={title ? `${title} — Nightingale rose chart` : "Nightingale rose chart"}
      data-testid="rose-chart"
    >
      {title && (
        <text x={center.x} y={14} fontSize={12} fontWeight={600} textAnchor="middle" fill="#111827">
          {title}
        </text>
      )}
      <g transform={`translate(${center.x}, ${center.y})`}>
        {petals.map(({ datum, path }) => (
          <path
            key={datum.axis}
            d={path ?? undefined}
            fill="#2563eb"
            stroke="#ffffff"
            strokeWidth={0.5}
            data-axis={datum.axis}
            data-value={datum.value}
          />
        ))}
        {petals.map(({ datum, mid }) => {
          const cos = Math.cos(mid);
          const sin = Math.sin(mid);
          const anchor = cos >= 0 ? "start" : "end";
          return (
            <text
              key={`label-${datum.axis}`}
              x={cos * labelRadius + (cos >= 0 ? 4 : -4)}
              y={sin * labelRadius}
              fontSize={10}
              fill="#6b7280"
              textAnchor={anchor}
              dominantBaseline="middle"
            >
              {datum.axis}
            </text>
          );
        })}
      </g>
      <circle
        cx={center.x}
        cy={center.y}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={1}
      />
      {fixtureWatermark && (
        <text
          data-testid="fixture-watermark"
          aria-hidden="true"
          x={width - 4}
          y={height - 6}
          textAnchor="end"
          pointerEvents="none"
          fill="#92400e"
          fontSize={10}
          fontWeight={600}
          letterSpacing="0.5"
        >
          {fixtureWatermark}
        </text>
      )}
    </svg>
  );
}
