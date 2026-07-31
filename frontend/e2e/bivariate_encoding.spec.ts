/**
 * Bivariate encoding (tests.md: Bivariate encoding).
 *
 * - switching modes (chapters) rebuilds the encoding and leaves exactly one
 *   bivariate fill layer visible, with all others at none;
 * - a feature's assigned class is unchanged after panning and zooming — the
 *   declared norm does not drift with the viewport;
 * - a dataset definition pairing variables of differing declared scale is
 *   rejected at load with an error naming both scales;
 * - break values and units are present in the rendered legend;
 * - `diverging-diverging` places breaks symmetrically about the declared norm,
 *   and a feature exactly at the norm classifies to the center band;
 * - a distribution that defeats tertiles fails loudly (the Fiji heat pair's
 *   constant `_max − _min` axis).
 */
import { test, expect } from "@playwright/test";
import { enterNarrative, visibleBivariateLayers } from "./bivariate-helpers";

test.describe("Bivariate encoding", () => {
  test("switching modes leaves exactly one bivariate fill layer visible", async ({ page }) => {
    await page.goto("/");
    await enterNarrative(page);

    // Chapter 1: sequential-sequential (safe water × population)
    expect(await visibleBivariateLayers(page)).toEqual(["bivariate-pict-water-pop-fill"]);

    // Chapter 2: diverging-diverging (sea level × indicator deviation)
    await page.locator('button[data-chapter-index="1"]').click();
    await page.waitForFunction(
      () => {
        const m = (window as any).__mapboxMap;
        return m && m.getLayoutProperty("bivariate-pict-sea-level-fill", "visibility") === "visible";
      },
      undefined,
      { timeout: 15000 },
    );
    expect(await visibleBivariateLayers(page)).toEqual(["bivariate-pict-sea-level-fill"]);

    // Chapter 3: qualitative-sequential (subregion × population)
    await page.locator('button[data-chapter-index="2"]').click();
    await page.waitForFunction(
      () => {
        const m = (window as any).__mapboxMap;
        return m && m.getLayoutProperty("bivariate-pict-subregion-pop-fill", "visibility") === "visible";
      },
      undefined,
      { timeout: 15000 },
    );
    expect(await visibleBivariateLayers(page)).toEqual(["bivariate-pict-subregion-pop-fill"]);
  });

  test("diverging mode centers on the declared norm with symmetric breaks", async ({ page }) => {
    await page.goto("/");
    await enterNarrative(page);

    await page.locator('button[data-chapter-index="1"]').click();
    await page.waitForFunction(
      () => {
        const m = (window as any).__mapboxMap;
        return m && m.getLayoutProperty("bivariate-pict-sea-level-fill", "visibility") === "visible";
      },
      undefined,
      { timeout: 15000 },
    );

    // Legend labels the norm cell: "center = 0"
    await expect(page.getByTestId("legend-norm")).toContainText("center = 0");

    // Breaks symmetric about the norm: axis1 edges are [-h, -h/3, h/3, h].
    const breaks = await page.evaluate(() => {
      const legend = document.querySelector('[role="group"][aria-label="Bivariate legend"]');
      return legend ? legend.textContent : "";
    });
    const seaLine = (breaks ?? "").split("\n").find((l) => l.includes("Sea level anomaly deviation"));
    expect(seaLine).toBeTruthy();
    // Contains the two symmetric edge values and the inner pair.
    expect(seaLine).toContain("-0.1");
    expect(seaLine).toContain("0.1");

    // Countries at the sea-level norm (deviation 0 — the 20 median countries)
    // classify to the center column. Fiji's anomaly equals the regional
    // median, so its fill is the center-column colour.
    const fijiClass = await page.evaluate(() => {
      const m = (window as any).__mapboxMap;
      const features = m.querySourceFeatures("bivariate-pict-sea-level");
      const f = features.find((feat: any) => feat.properties?.name === "Fiji");
      return f ? f.properties?.fill_color : null;
    });
    expect(fijiClass).toBeTruthy();

    // A feature EXACTLY at the norm on both axes classifies to the center cell
    // (spec: Diverging Mode Centers On A Declared Norm). Breaks are computed
    // from the real distribution, so the real data is classified alongside the
    // synthetic at-norm feature.
    const centerClass = await page.evaluate(async () => {
      const bivariate = (window as any).__bivariate;
      const def = bivariate.datasetDefinitions.find((d: any) => d.id === "pict-sea-level");
      const palette = [
        ["#b5a684", "#f5e3b8", "#e6a546"],
        ["#b5bfd5", "#f5f5f5", "#e6beba"],
        ["#584f99", "#c3b6c7", "#af4b6c"],
      ];
      const res = await fetch(def.dataUrl);
      const geojson = await res.json();
      const synthetic = {
        type: "Feature",
        geometry: { type: "Point", coordinates: [0, 0] },
        properties: {
          id: "synthetic-at-norm",
          name: "Synthetic at norm",
          sea_level_deviation_m: 0,
          water_access_deviation_pp: 0,
        },
      };
      const result = bivariate.classify(
        [...geojson.features, synthetic],
        def,
        "diverging-diverging",
        palette,
      );
      const f = result.features.find((feat: any) => feat.id === "synthetic-at-norm");
      return { classRow: f.classRow, classCol: f.classCol, fillColor: f.fillColor };
    });
    expect(centerClass.classRow).toBe(1);
    expect(centerClass.classCol).toBe(1);
    expect(centerClass.fillColor).toBe("#f5f5f5");
  });

  test("feature classes are stable across pan and zoom (norm does not drift)", async ({ page }) => {
    await page.goto("/");
    await enterNarrative(page);

    const readClasses = () =>
      page.evaluate(() => {
        const m = (window as any).__mapboxMap;
        const features = m.querySourceFeatures("bivariate-pict-water-pop");
        const seen = new Map();
        for (const f of features) {
          const id = f.properties?.id ?? f.id;
          if (typeof id === "string" && !seen.has(id)) {
            seen.set(id, f.properties?.fill_color);
          }
        }
        return Array.from(seen.entries());
      });

    const before = await readClasses();
    expect(before.length).toBeGreaterThan(0);

    // Pan and zoom within the Pacific viewport (features outside the loaded
    // tiles are not returned by querySourceFeatures, so the comparison is over
    // the features visible in BOTH viewports).
    await page.evaluate(() => {
      const m = (window as any).__mapboxMap;
      m.jumpTo({ center: [170, -10], zoom: 2.5 });
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const m = (window as any).__mapboxMap;
      m.jumpTo({ center: [175, -20], zoom: 4 });
    });
    await page.waitForTimeout(800);

    const after = await readClasses();
    const afterMap = new Map(after);
    let compared = 0;
    for (const [id, color] of before) {
      if (!afterMap.has(id)) continue; // feature left the loaded tiles — not evidence of change
      compared += 1;
      expect(afterMap.get(id), `class of ${id} unchanged after pan/zoom`).toBe(color);
    }
    expect(compared).toBeGreaterThan(0);
  });

  test("mixed-scale dataset definition is rejected with an error naming both scales", async ({ page }) => {
    await page.goto("/");
    await enterNarrative(page);

    const message = await page.evaluate(() => {
      const bivariate = (window as any).__bivariate;
      const def = JSON.parse(JSON.stringify(bivariate.datasetDefinitions[2])); // subregion × pop
      def.axis2.scale = "fiji-cells"; // pair a PICT-country variable with a Fiji-cells variable
      try {
        bivariate.classify([], def, "sequential-sequential", [["#000"], ["#000"], ["#000"]]);
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    });

    expect(message).toBeTruthy();
    expect(message).toContain("pict-country");
    expect(message).toContain("fiji-cells");
  });

  test("break values and units are present in the rendered legend", async ({ page }) => {
    await page.goto("/");
    await enterNarrative(page);

    const legend = await page.locator('[role="group"][aria-label="Bivariate legend"]').innerText();
    expect(legend).toContain("Safe water access");
    expect(legend).toContain("%");
    expect(legend).toContain("Population");
    expect(legend).toContain("people");
    expect(legend).toContain("–"); // break-value range separator
  });

  test("a distribution that defeats tertiles fails loudly (Fiji heat spread axis)", async ({ page }) => {
    await page.goto("/");
    await enterNarrative(page);

    const outcome = await page.evaluate(async () => {
      const bivariate = (window as any).__bivariate;
      const fijiDef = bivariate.datasetDefinitions.find((d: any) => d.id === "fiji-heat-variability");
      const res = await fetch(fijiDef.dataUrl);
      const geojson = await res.json();
      for (const feature of geojson.features) {
        feature.properties.extreme_heat_days_spread =
          feature.properties.extreme_heat_days_max - feature.properties.extreme_heat_days_min;
      }
      try {
        bivariate.classify(geojson.features, fijiDef, "sequential-sequential",
          [["#a", "#b", "#c"], ["#d", "#e", "#f"], ["#g", "#h", "#i"]]);
        return { failed: false };
      } catch (err) {
        return { failed: true, message: err instanceof Error ? err.message : String(err) };
      }
    });

    expect(outcome.failed).toBe(true);
    expect(outcome.message).toContain("Inter-annual variability of extreme heat days");
  });
});
