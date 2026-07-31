/**
 * Map Canvas Loading smoke test (tests.md: "the smoke test that must exist
 * first"). Must pass on a cold load with NO user interaction — v1's failure
 * occurred before any interaction took place.
 *
 * - every declared custom source is retrievable via getSource after style load;
 * - the active thematic layer reports layout visibility `visible`;
 * - `querySourceFeatures` returns a non-zero count for the active source;
 * - the map instance is reachable from the browser context.
 */
import { test, expect } from "@playwright/test";
import { BIVARIATE_LAYER_IDS, waitForMap } from "./bivariate-helpers";

const SOURCE_IDS = [
  "bivariate-pict-water-pop",
  "bivariate-pict-sea-level",
  "bivariate-pict-subregion-pop",
  "bivariate-fiji-heat-variability",
];

test.describe("Map Canvas Loading", () => {
  test("custom sources exist after style load", async ({ page }) => {
    await page.goto("/");
    await waitForMap(page);

    const sources = await page.evaluate((ids) => {
      const m = (window as any).__mapboxMap;
      return ids.map((id) => ({ id, exists: !!m.getSource(id) }));
    }, SOURCE_IDS);

    for (const source of sources) {
      expect(source.exists, `source ${source.id} retrievable via getSource`).toBe(true);
    }
  });

  test("active thematic layer is visible with all others at none", async ({ page }) => {
    await page.goto("/");
    await waitForMap(page);

    const visibilities = await page.evaluate((ids) => {
      const m = (window as any).__mapboxMap;
      return ids.map((id) => ({
        id,
        visibility: m.getLayer(id) ? m.getLayoutProperty(id, "visibility") : undefined,
      }));
    }, BIVARIATE_LAYER_IDS);

    const visible = visibilities.filter((v) => v.visibility === "visible");
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("bivariate-pict-water-pop-fill");
    const hidden = visibilities.filter((v) => v.id !== "bivariate-pict-water-pop-fill");
    for (const h of hidden) {
      expect(h.visibility, `${h.id} hidden`).toBe("none");
    }
  });

  test("querySourceFeatures returns a non-zero count for the active source", async ({ page }) => {
    await page.goto("/");
    await waitForMap(page);

    await page.waitForFunction(
      () => {
        const m = (window as any).__mapboxMap;
        return m && m.querySourceFeatures("bivariate-pict-water-pop").length > 0;
      },
      undefined,
      { timeout: 20000 },
    );

    const count = await page.evaluate(() => {
      const m = (window as any).__mapboxMap;
      return m.querySourceFeatures("bivariate-pict-water-pop").length;
    });
    expect(count).toBeGreaterThan(0);
  });

  test("map instance is reachable from the browser context", async ({ page }) => {
    await page.goto("/");
    await waitForMap(page);

    const reachable = await page.evaluate(() => {
      const m = (window as any).__mapboxMap;
      return typeof m.getLayoutProperty === "function" && typeof m.setFeatureState === "function";
    });
    expect(reachable).toBe(true);
  });
});
