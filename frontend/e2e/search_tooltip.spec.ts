/**
 * Search and tooltips (tests.md: Search Brushes A Named Region, Tooltips
 * Render Typed Fields).
 *
 * - searching a known region brushes it across map AND charts;
 * - an unmatched search reports no match without disturbing the selection;
 * - tooltips render labelled values with units and a source attribution;
 * - no raw property key (extreme_heat_days_mean, water_access_pct, …) appears
 *   in any tooltip text.
 */
import { test, expect } from "@playwright/test";
import { enterNarrative, featureHighlighted } from "./bivariate-helpers";

const SOURCE = "bivariate-pict-water-pop";

test.describe("Search brushes a named region", () => {
  test("searching a known region selects it on the map", async ({ page }) => {
    await page.goto("/");
    await enterNarrative(page);

    const search = page.getByRole("combobox", { name: "Search a region" });
    await search.fill("Solomon Islands");
    await search.press("Enter");

    expect(await featureHighlighted(page, SOURCE, "iso3-SLB")).toBe(true);
  });

  test("unknown region reports no match and leaves the existing selection intact", async ({ page }) => {
    await page.goto("/");
    await enterNarrative(page);

    const search = page.getByRole("combobox", { name: "Search a region" });
    await search.fill("Tuvalu");
    await search.press("Enter");
    expect(await featureHighlighted(page, SOURCE, "iso3-TUV")).toBe(true);

    await search.fill("NoSuchPlace");
    await search.press("Enter");
    await expect(page.getByTestId("search-no-match")).toContainText("NoSuchPlace");
    expect(await featureHighlighted(page, SOURCE, "iso3-TUV")).toBe(true);
  });
});

test.describe("Tooltips render typed fields, never raw properties", () => {
  test("hovering a feature shows labelled values with units and source", async ({ page }) => {
    await page.goto("/");
    await enterNarrative(page);

    // Find a screen pixel inside a rendered bivariate fill (scan a coarse grid
    // of the canvas) so the hover lands on real geometry.
    const point = await page.evaluate(() => {
      const m = (window as any).__mapboxMap;
      const canvas = document.querySelector(".mapboxgl-canvas") as HTMLElement;
      const rect = canvas.getBoundingClientRect();
      for (let y = 10; y < rect.height - 10; y += 24) {
        for (let x = 10; x < rect.width - 10; x += 24) {
          const features = m.queryRenderedFeatures([x, y], { layers: ["bivariate-pict-water-pop-fill"] });
          if (features.length > 0) {
            return { x: rect.left + x, y: rect.top + y };
          }
        }
      }
      return null;
    });
    expect(point).not.toBeNull();
    if (!point) return;

    await page.mouse.move(point.x, point.y);
    const tooltip = page.getByTestId("viz-tooltip");
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    const text = await tooltip.innerText();
    // Labelled values with units.
    expect(text).toContain("Safe water access");
    expect(text).toContain("%");
    expect(text).toContain("Population");
    expect(text).toContain("people");
    // Source attribution.
    expect(text).toMatch(/SPC Pacific Data Hub|Natural Earth/);
  });

  test("no raw property key appears in tooltip text", async ({ page }) => {
    await page.goto("/");
    await enterNarrative(page);

    const point = await page.evaluate(() => {
      const m = (window as any).__mapboxMap;
      const canvas = document.querySelector(".mapboxgl-canvas") as HTMLElement;
      const rect = canvas.getBoundingClientRect();
      for (let y = 10; y < rect.height - 10; y += 24) {
        for (let x = 10; x < rect.width - 10; x += 24) {
          const features = m.queryRenderedFeatures([x, y], { layers: ["bivariate-pict-water-pop-fill"] });
          if (features.length > 0) {
            return { x: rect.left + x, y: rect.top + y };
          }
        }
      }
      return null;
    });
    expect(point).not.toBeNull();
    if (!point) return;

    await page.mouse.move(point.x, point.y);
    const tooltip = page.getByTestId("viz-tooltip");
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    const text = await tooltip.innerText();
    // No developer-facing slugs (spec: Tooltips Render Typed Fields).
    for (const slug of ["water_access_pct", "pop_est", "iso3-", "sea_level_deviation_m", "fill_color", "extreme_heat_days_mean"]) {
      expect(text, `tooltip must not contain "${slug}"`).not.toContain(slug);
    }
  });
});
