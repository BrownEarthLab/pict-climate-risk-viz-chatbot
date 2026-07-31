/**
 * Population small-multiples (tasks.md 4.3): one small chart per region,
 * SHARED scales, read by comparison — the definition of small multiples
 * (research.md Glossary). Shaped like what issue #11's official PDH
 * population data would produce; the workbench feeds it fixture series with
 * generic region labels.
 *
 * Shared source (Decision 5): promotion to real data is a change of props,
 * not a port.
 */
import { useMemo } from "react";
import { scaleBand, scaleLinear } from "d3-scale";

export interface PopulationPoint {
  year: number;
  value: number;
}

export interface PopulationSeries {
  region: string;
  points: PopulationPoint[];
}

export interface PopulationSmallMultiplesProps {
  series: PopulationSeries[];
  width: number;
  height: number;
  title?: string;
  units?: string;
  fixtureWatermark?: string;
}

export function PopulationSmallMultiples({
  series,
  width,
  height,
  title,
  units = "",
  fixtureWatermark,
}: PopulationSmallMultiplesProps) {
  const cols = Math.ceil(Math.sqrt(series.length));
  const rows = Math.ceil(series.length / cols);
  const cellW = width / cols;
  const cellH = height / rows;

  // Shared scale across every cell — the point of small multiples.
  const y = useMemo(() => {
    const max = Math.max(0.0001, ...series.flatMap((s) => s.points.map((p) => p.value)));
    return scaleLinear().domain([0, max * 1.1]).range([cellH - 26, 12]);
  }, [series, cellH]);

  const allYears = useMemo(
    () => Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.year)))).sort((a, b) => a - b),
    [series],
  );

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={title ? `${title} — population small multiples` : "Population small multiples"}
      data-testid="population-small-multiples"
    >
      {title && (
        <text x={width / 2} y={14} fontSize={12} fontWeight={600} textAnchor="middle" fill="#111827">
          {title}
        </text>
      )}
      {series.map((s, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const ox = col * cellW;
        const oy = row * cellH + (title ? 10 : 0);
        const x = scaleBand<number>()
          .domain(allYears)
          .range([6, cellW - 6])
          .padding(0.25);
        return (
          <g key={s.region} transform={`translate(${ox}, ${oy})`} data-region={s.region}>
            <text x={cellW / 2} y={12} fontSize={10} fontWeight={600} textAnchor="middle" fill="#111827">
              {s.region}
            </text>
            {s.points.map((p) => (
              <rect
                key={`${s.region}-${p.year}`}
                x={x(p.year)}
                y={y(p.value)}
                width={Math.max(2, x.bandwidth())}
                height={Math.max(0, 12 + cellH - 26 - y(p.value))}
                fill="#2563eb"
                data-year={p.year}
                data-value={p.value}
              />
            ))}
            {units && (
              <text x={6} y={cellH - 10} fontSize={9} fill="#9ca3af">
                {units}
              </text>
            )}
          </g>
        );
      })}
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
