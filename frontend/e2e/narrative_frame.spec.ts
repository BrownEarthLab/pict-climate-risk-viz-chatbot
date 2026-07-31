/**
 * Scrollytelling frame (tests.md: Scrollytelling frame).
 *
 * - advancing a chapter leaves exactly one thematic layer visible and sets the
 *   previous one to none;
 * - re-entering a chapter reapplies its encoding, camera, and legend mode;
 * - the splash view renders before the control surface and is dismissed on
 *   entry;
 * - free exploration clears chapter filters while leaving legend and search
 *   operable;
 * - a manual legend selection survives an unrelated parent re-render — the
 *   direct regression test for v1's Patch 2.
 */
import { test, expect } from "@playwright/test";
import { enterNarrative, visibleBivariateLayers } from "./bivariate-helpers";

test.describe("Scrollytelling frame", () => {
  test("splash precedes the control surface and is dismissed on entry", async ({ page }) => {
    await page.goto("/");

    // Splash is displayed first.
    await expect(page.getByTestId("splash-view")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Two stresses, one map" })).toBeVisible();
    // The entry point is the single navigation control on first paint.
    await expect(page.getByTestId("enter-narrative")).toBeVisible();

    await page.getByTestId("enter-narrative").click();
    await expect(page.getByTestId("splash-view")).not.toBeVisible();
    // The narrative control surface is now displayed.
    await expect(page.getByRole("navigation", { name: "Chapters" })).toBeVisible();
  });

  test("advancing a chapter replaces rather than stacks", async ({ page }) => {
    await page.goto("/");
    await enterNarrative(page);

    expect(await visibleBivariateLayers(page)).toEqual(["bivariate-pict-water-pop-fill"]);

    await page.locator('button[data-chapter-index="1"]').click();
    await page.waitForFunction(
      () => {
        const m = (window as any).__mapboxMap;
        return m && m.getLayoutProperty("bivariate-pict-sea-level-fill", "visibility") === "visible";
      },
      undefined,
      { timeout: 15000 },
    );
    // Exactly one thematic layer visible; previous one at none.
    expect(await visibleBivariateLayers(page)).toEqual(["bivariate-pict-sea-level-fill"]);
    const prev = await page.evaluate(() => {
      const m = (window as any).__mapboxMap;
      return m.getLayoutProperty("bivariate-pict-water-pop-fill", "visibility");
    });
    expect(prev).toBe("none");
  });

  test("re-entering a chapter reapplies its encoding, camera, and legend mode", async ({ page }) => {
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

    // Pan somewhere far away — the chapter preset camera must be re-applied.
    await page.evaluate(() => {
      const m = (window as any).__mapboxMap;
      m.jumpTo({ center: [-150, 30], zoom: 1 });
    });
    await page.waitForTimeout(400);

    // Re-enter chapter 1.
    await page.locator('button[data-chapter-index="0"]').click();
    await page.waitForFunction(
      () => {
        const m = (window as any).__mapboxMap;
        return m && m.getLayoutProperty("bivariate-pict-water-pop-fill", "visibility") === "visible";
      },
      undefined,
      { timeout: 15000 },
    );
    expect(await visibleBivariateLayers(page)).toEqual(["bivariate-pict-water-pop-fill"]);
    await expect(page.getByTestId("legend-mode")).toContainText("sequential");

    const center = await page.evaluate(() => {
      const m = (window as any).__mapboxMap;
      const c = m.getCenter();
      return [c.lng, c.lat];
    });
    // Camera reapplied: within a tolerance of the declared center [170, -15].
    expect(Math.abs(center[0] - 170)).toBeLessThan(5);
    expect(Math.abs(center[1] + 15)).toBeLessThan(5);
  });

  test("free exploration clears chapter filters while leaving legend and search operable", async ({ page }) => {
    await page.goto("/");
    await enterNarrative(page);

    // Make a chapter-imposed selection first.
    const cell = page.locator('button[data-cell-row="1"][data-cell-col="1"]');
    await cell.click();
    await expect(cell).toHaveAttribute("aria-pressed", "true");

    // Exit to free exploration.
    await page.getByTestId("free-exploration").click();
    await expect(page.getByTestId("return-to-narrative")).toBeVisible();

    // Chapter-imposed selection is cleared.
    const cleared = await page.evaluate(() => {
      const m = (window as any).__mapboxMap;
      const src = "bivariate-pict-water-pop";
      const feats = m.querySourceFeatures(src);
      const ids = feats.map((f: any) => f.properties?.id).filter((v: unknown, i: number, a: unknown[]) => a.indexOf(v) === i);
      return ids.filter((id: string) => m.getFeatureState({ source: src, id }).highlighted === true).length;
    });
    expect(cleared).toBe(0);

    // Legend and search remain operable.
    const legendCell = page.locator('button[data-cell-row="2"][data-cell-col="1"]');
    await legendCell.click();
    const search = page.getByRole("combobox", { name: "Search a region" });
    await search.fill("Nauru");
    await search.press("Enter");
    const highlighted = await page.evaluate(() => {
      const m = (window as any).__mapboxMap;
      return m.getFeatureState({ source: "bivariate-pict-water-pop", id: "iso3-NRU" }).highlighted;
    });
    expect(highlighted).toBe(true);
  });

  test("manual legend selection survives an unrelated parent re-render", async ({ page }) => {
    await page.goto("/");
    await enterNarrative(page);

    const cell = page.locator('button[data-cell-row="1"][data-cell-col="1"]');
    await cell.click();
    await expect(cell).toHaveAttribute("aria-pressed", "true");

    const highlightedBefore = await page.evaluate(() => {
      const m = (window as any).__mapboxMap;
      const src = "bivariate-pict-water-pop";
      const feats = m.querySourceFeatures(src);
      const ids = feats.map((f: any) => f.properties?.id).filter((v: unknown, i: number, a: unknown[]) => a.indexOf(v) === i);
      return ids.filter((id: string) => m.getFeatureState({ source: src, id }).highlighted === true).length;
    });
    expect(highlightedBefore).toBeGreaterThan(0);

    // Trigger an unrelated parent re-render: hover a map feature (updates
    // hoveredId in the owner) — the v1 bug reset the selection here.
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
    if (point) {
      await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(600);
      await page.mouse.move(10, 10); // leave — clears hover, another re-render
      await page.waitForTimeout(400);
    }

    await expect(cell).toHaveAttribute("aria-pressed", "true");
    const highlightedAfter = await page.evaluate(() => {
      const m = (window as any).__mapboxMap;
      const src = "bivariate-pict-water-pop";
      const feats = m.querySourceFeatures(src);
      const ids = feats.map((f: any) => f.properties?.id).filter((v: unknown, i: number, a: unknown[]) => a.indexOf(v) === i);
      return ids.filter((id: string) => m.getFeatureState({ source: src, id }).highlighted === true).length;
    });
    expect(highlightedAfter).toBe(highlightedBefore);
  });
});
