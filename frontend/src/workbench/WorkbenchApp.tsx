/**
 * The workbench gallery shell (tasks.md 4.4): lists the components under
 * development and the controls to vary each one's inputs. Holds NO component
 * logic of its own — every chart here lives in shared source and receives
 * props (architecture.md Decision 5). The shell only wires fixtures to
 * components and fetches the data the fixtures describe.
 *
 * Fixture views are wrapped in the non-dismissible watermark (Decision 4);
 * the promotion-rehearsal view renders a REAL dataset (provenance "real")
 * and is deliberately unwrapped — the component renders unwatermarked
 * because the data is real, which is the rehearsal's point.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FixtureWatermark } from "../components/viz/FixtureWatermark";
import { NightingaleRoseChart } from "../components/viz/NightingaleRoseChart";
import {
  CategoricalHotspotLayer,
  HotspotLegend,
} from "../components/viz/CategoricalHotspotLayer";
import { PopulationSmallMultiples } from "../components/viz/PopulationSmallMultiples";
import { roseFixtures } from "../fixtures/rose";
import { hotspotFixtures } from "../fixtures/hotspot";
import { populationFixtures } from "../fixtures/population";

const CHART_WIDTH = 520;
const CHART_HEIGHT = 420;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

export function WorkbenchApp() {
  return (
    <div className="min-h-screen bg-[#f8f6f1] p-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Viz Component Workbench</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">
          Development surface for components whose production data is not yet available
          (issues #9, #10, #11). Every view renders synthetic fixture data unless marked
          real. Fixture labels are deliberately generic — a cropped screenshot must
          still read as a mockup.
        </p>
      </header>

      <div className="grid max-w-6xl gap-6">
        <RoseSection />
        <HotspotSection />
        <PopulationSection />
        <RehearsalSection />
      </div>
    </div>
  );
}

function RoseSection() {
  const [variantId, setVariantId] = useState("rose-small");
  const variant = roseFixtures.find((f) => f.id === variantId) ?? roseFixtures[0];

  return (
    <Section title="Nightingale rose chart — fixture">
      <div className="mb-3 flex items-center gap-2 text-sm text-gray-700">
        <label htmlFor="rose-variant">Dataset variant</label>
        <select
          id="rose-variant"
          data-testid="rose-variant"
          value={variant.id}
          onChange={(e) => setVariantId(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {roseFixtures.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>
      </div>
      <FixtureWatermark>
        <NightingaleRoseChart data={variant.rows} width={CHART_WIDTH} height={CHART_HEIGHT} title="Fixture: per-region indicator" />
      </FixtureWatermark>
    </Section>
  );
}

function HotspotSection() {
  const [classCount, setClassCount] = useState("3");
  const [geometry, setGeometry] = useState<GeoJSON.FeatureCollection | null>(null);

  const variant =
    hotspotFixtures.find((f) => f.id === `hotspot-${classCount}`) ?? hotspotFixtures[0];

  useEffect(() => {
    let cancelled = false;
    fetch(variant.geometryUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${variant.geometryUrl}: HTTP ${res.status}`);
        return res.json() as Promise<GeoJSON.FeatureCollection>;
      })
      .then((geo) => {
        if (!cancelled) setGeometry(geo);
      })
      .catch((err) => {
        if (!cancelled) console.error(err);
      });
    return () => {
      cancelled = true;
    };
  }, [variant.geometryUrl]);

  // Mechanical join: literal class per feature, aligned by INDEX with the
  // reference file's feature order (the fixture's contract). No class is
  // computed here — the values come straight from the fixture.
  const features = useMemo(() => {
    if (!geometry) return [];
    return geometry.features.map((f, i) => ({
      ...f,
      properties: {
        ...(f.properties ?? {}),
        class: variant.assignments[i % variant.assignments.length] ?? "Class 1",
      },
    }));
  }, [geometry, variant]);

  return (
    <Section title="Categorical hotspot layer — fixture (real tikina geometry, literal classes)">
      <div className="mb-3 flex items-center gap-2 text-sm text-gray-700">
        <label htmlFor="hotspot-class-count">Class count</label>
        <select
          id="hotspot-class-count"
          data-testid="hotspot-class-count"
          value={classCount}
          onChange={(e) => setClassCount(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {hotspotFixtures.map((f) => (
            <option key={f.id} value={f.classes.length}>
              {f.classes.length} classes
            </option>
          ))}
        </select>
      </div>
      {geometry ? (
        <FixtureWatermark>
          <div className="flex flex-col gap-2">
            <CategoricalHotspotLayer
              features={features}
              classKey="class"
              classes={variant.classes}
              width={CHART_WIDTH}
              height={CHART_HEIGHT}
              title={`Fixture: hotspot encoding over real tikina geometry (${variant.classes.length} classes)`}
            />
            <HotspotLegend classes={variant.classes} />
          </div>
        </FixtureWatermark>
      ) : (
        <p className="text-sm text-gray-500">Loading real tikina geometry…</p>
      )}
    </Section>
  );
}

function PopulationSection() {
  const [variantId, setVariantId] = useState("population-small");
  const variant = populationFixtures.find((f) => f.id === variantId) ?? populationFixtures[0];

  return (
    <Section title="Population small-multiples — fixture">
      <div className="mb-3 flex items-center gap-2 text-sm text-gray-700">
        <label htmlFor="population-variant">Dataset variant</label>
        <select
          id="population-variant"
          data-testid="population-variant"
          value={variant.id}
          onChange={(e) => setVariantId(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {populationFixtures.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>
      </div>
      <FixtureWatermark>
        <PopulationSmallMultiples
          series={variant.series}
          width={CHART_WIDTH}
          height={CHART_HEIGHT}
          title="Fixture: generic-region population (thousands)"
          units="thousands"
        />
      </FixtureWatermark>
    </Section>
  );
}

/**
 * Promotion rehearsal (tasks.md 5.4, tests.md "Promotion rehearsal"): the
 * rose chart fed with REAL values — `mean_tasmax_c_mean` from the served
 * copy of the Fiji heat file (95 non-null of 102 cells, 24.30–28.79 °C).
 * NOT `extreme_heat_days_*`: every cell is 0 there and a flat line proves
 * nothing. Real provenance means NO watermark — promotion is a change of
 * props, not a port, and the component code is untouched.
 */
function RehearsalSection() {
  const [rows, setRows] = useState<{ axis: string; value: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/fiji_extreme_heat_days.geojson")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load heat data: HTTP ${res.status}`);
        return res.json() as Promise<GeoJSON.FeatureCollection>;
      })
      .then((geo) => {
        if (cancelled) return;
        const built = geo.features
          .map((f) => {
            const raw = f.properties?.["mean_tasmax_c_mean"];
            // `Number(null)` is 0 — null cells must be excluded, not rendered
            // as zero-value petals (95 non-null of 102 cells).
            if (raw === null || raw === undefined || raw === "") return null;
            const value = Number(raw);
            return Number.isFinite(value)
              ? { axis: String(f.properties?.["cell_id"] ?? ""), value }
              : null;
          })
          .filter((r): r is { axis: string; value: number } => r !== null);
        setRows(built);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Section title="Promotion rehearsal — real data, no watermark">
      <p className="mb-3 max-w-3xl text-sm text-gray-500">
        The rose chart fed with real <code>mean_tasmax_c_mean</code> values (95 non-null of 102
        heat cells, 24.30–28.79 °C). Renders unwatermarked because the provenance is
        {" "}
        <code>&quot;real&quot;</code> — no code change to the component.
      </p>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : rows === null ? (
        <p className="text-sm text-gray-500">Loading real heat data…</p>
      ) : (
        <div data-testid="rehearsal-view">
          <NightingaleRoseChart
            data={rows}
            width={CHART_WIDTH}
            height={CHART_HEIGHT}
            title="Rehearsal: mean annual maximum temperature by heat cell (°C)"
          />
        </div>
      )}
    </Section>
  );
}
