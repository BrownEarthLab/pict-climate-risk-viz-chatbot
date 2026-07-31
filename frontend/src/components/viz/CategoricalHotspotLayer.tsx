/**
 * Categorical hotspot layer (tasks.md 4.2): renders LITERAL class values with
 * a categorical palette over real geometry. This is the encoding only — the
 * 16-category space-time classification is explicitly out of scope (spec:
 * "The Workbench Computes No Analysis"); the per-feature class values are
 * read straight from `feature.properties[classKey]`, which the fixture
 * supplies as literal data. When real analysis lands (issue #9), the
 * component is unchanged — it renders whatever class values it is given.
 *
 * Projection is a plain equirectangular fit over the feature bounding box,
 * normalised across the antimeridian (Fiji's eastern groups cross 180°).
 * This is rendering geometry, not analysis.
 *
 * React renders every mark; D3 supplies only the categorical colour scale.
 */
import { useMemo } from "react";
import { scaleOrdinal } from "d3-scale";

/**
 * 16 hand-picked distinguishable categorical colours (Tableau10-compatible
 * first 10, extended with six more) — enough for the fixture's 16-class
 * variant and readable against the light background.
 */
export const CATEGORICAL_CLASS_PALETTE = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#17becf",
  "#aec7e8",
  "#ffbb78",
  "#98df8a",
  "#ff9896",
  "#c5b0d5",
  "#c49c94",
];

export interface CategoricalHotspotLayerProps {
  features: GeoJSON.Feature[];
  /** Property key holding the literal class value on each feature. */
  classKey: string;
  /** Ordered class labels — the palette and legend domain. */
  classes: string[];
  width: number;
  height: number;
  title?: string;
  fixtureWatermark?: string;
}

interface Position {
  lon: number;
  lat: number;
}

/** Flatten every position of a Polygon or MultiPolygon geometry. */
function collectPositions(geometry: GeoJSON.Geometry): Position[] {
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") return [];
  const coords = (geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).coordinates;
  const out: Position[] = [];
  const walk = (node: unknown[]) => {
    if (typeof node[0] === "number") {
      out.push({ lon: node[0] as number, lat: node[1] as number });
      return;
    }
    for (const c of node) walk(c as unknown[]);
  };
  walk(coords as unknown[]);
  return out;
}

/** Project the feature geometries; returns a path string per feature. */
function buildPaths(
  features: GeoJSON.Feature[],
  width: number,
  height: number,
): Map<string, string> {
  const margin = 8;
  const innerW = Math.max(1, width - margin * 2);
  const innerH = Math.max(1, height - margin * 2);

  const all = features.flatMap((f) => collectPositions(f.geometry));

  // Antimeridian: Fiji's eastern groups cross 180°, so a raw min/max span
  // of > 180° means the dataset wraps. Normalise western longitudes up by
  // 360 before projecting so the map is not inverted.
  // Iterate rather than spread: the tikina layer has ~130k positions and
  // `Math.min(...huge)` overflows the call stack.
  let rawMin = Infinity;
  let rawMax = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const p of all) {
    rawMin = Math.min(rawMin, p.lon);
    rawMax = Math.max(rawMax, p.lon);
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
  }
  const wrap = rawMax - rawMin > 180;
  for (const p of all) {
    const lon = wrap && p.lon < 0 ? p.lon + 360 : p.lon;
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }
  const lonSpan = maxLon - minLon || 1;
  const latSpan = maxLat - minLat || 1;

  const px = (lon: number) => margin + ((wrap && lon < 0 ? lon + 360 : lon) - minLon) / lonSpan * innerW;
  const py = (lat: number) => margin + (1 - (lat - minLat) / latSpan) * innerH;

  const ringToPath = (ring: number[][]) =>
    ring
      .map(([lon, lat], i) => `${i === 0 ? "M" : "L"}${px(lon).toFixed(2)},${py(lat).toFixed(2)}`)
      .join("") + "Z";

  const paths = new Map<string, string>();
  for (const feature of features) {
    const geom = feature.geometry;
    let d = "";
    if (geom.type === "Polygon") {
      d = geom.coordinates.map(ringToPath).join("");
    } else if (geom.type === "MultiPolygon") {
      d = geom.coordinates.flat().map(ringToPath).join("");
    }
    paths.set(String(feature.id ?? feature.properties?.["tid17"] ?? feature.properties?.["cell_id"] ?? ""), d);
  }
  return paths;
}

export function CategoricalHotspotLayer({
  features,
  classKey,
  classes,
  width,
  height,
  title,
  fixtureWatermark,
}: CategoricalHotspotLayerProps) {
  const color = useMemo(
    () => scaleOrdinal<string, string>().domain(classes).range(CATEGORICAL_CLASS_PALETTE),
    [classes],
  );

  const paths = useMemo(() => buildPaths(features, width, height), [features, width, height]);

  const rendered = features
    .map((f) => {
      const cls = f.properties?.[classKey];
      const key = String(f.id ?? f.properties?.["tid17"] ?? f.properties?.["cell_id"] ?? "");
      return { key, cls, d: paths.get(key) ?? "" };
    })
    .filter((r) => typeof r.cls === "string" && r.d.length > 0);

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={title ? `${title} — categorical hotspot layer` : "Categorical hotspot layer"}
      data-testid="hotspot-layer"
    >
      {title && (
        <text x={width / 2} y={14} fontSize={12} fontWeight={600} textAnchor="middle" fill="#111827">
          {title}
        </text>
      )}
      {rendered.map(({ key, cls, d }) => (
        <path
          key={key}
          d={d}
          fill={color(String(cls))}
          stroke="#ffffff"
          strokeWidth={0.5}
          data-class={String(cls)}
        />
      ))}
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

export function HotspotLegend({ classes }: { classes: string[] }) {
  return (
    <div data-testid="hotspot-legend" className="flex max-w-full flex-wrap gap-x-4 gap-y-1">
      {classes.map((cls, i) => (
        <span key={cls} className="inline-flex items-center gap-1 text-xs text-gray-700">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: CATEGORICAL_CLASS_PALETTE[i % CATEGORICAL_CLASS_PALETTE.length] }}
          />
          {cls}
        </span>
      ))}
    </div>
  );
}
