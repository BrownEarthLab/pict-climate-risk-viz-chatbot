/**
 * Fixture renderings are visibly marked (tests.md "Labelling"; spec
 * "Fixture Renderings Are Visibly Marked"). For every fixture view in the
 * workbench:
 *
 *   - a synthetic-data marker is visible WITHIN the visualization bounds
 *     (so it is captured by a screenshot of the chart, not by a page
 *     banner a crop removes);
 *   - no control removes the marker while the visualization stays
 *     displayed — the marker is non-dismissible.
 */
import { test, expect } from "@playwright/test";

const WATERMARK = '[data-testid="fixture-watermark"]';

test.describe("Workbench fixture watermark", () => {
  test("every fixture view shows a synthetic-data marker within its bounds", async ({
    page,
  }) => {
    await page.goto("/workbench.html");

    // The hotspot fixture view mounts only after its async geometry fetch
    // resolves — wait for all three fixture views before counting.
    const views = page.locator('[data-testid="fixture-view"]');
    await expect(views.first()).toBeVisible();
    await expect(page.getByTestId("hotspot-legend")).toBeVisible();

    const viewCount = await views.count();
    expect(viewCount).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < viewCount; i += 1) {
      const view = views.nth(i);
      const marker = view.locator(WATERMARK);
      await expect(marker).toBeVisible();
      await expect(marker).toContainText(/synthetic/i);

      // The marker sits inside the visualization bounds.
      const viewBox = await view.boundingBox();
      const markerBox = await marker.boundingBox();
      expect(markerBox).not.toBeNull();
      expect(viewBox).not.toBeNull();
      expect(markerBox!.x).toBeGreaterThanOrEqual(viewBox!.x);
      expect(markerBox!.y).toBeGreaterThanOrEqual(viewBox!.y);
      expect(markerBox!.x + markerBox!.width).toBeLessThanOrEqual(viewBox!.x + viewBox!.width + 1);
      expect(markerBox!.y + markerBox!.height).toBeLessThanOrEqual(viewBox!.y + viewBox!.height + 1);
    }
  });

  test("no control dismisses the marker while the visualization remains displayed", async ({
    page,
  }) => {
    await page.goto("/workbench.html");

    const marker = page.locator(WATERMARK).first();
    await expect(marker).toBeVisible();

    // There is no dismiss-like control anywhere in the workbench.
    const dismissive = page.locator("button, a, input[type='button']").filter({
      hasText: /dismiss|hide|remove|close marker|clear marker/i,
    });
    await expect(dismissive).toHaveCount(0);

    // Interacting with every control the gallery offers must not remove the
    // marker while the charts stay displayed.
    const controls = page.locator("select, button");
    const count = await controls.count();
    for (let i = 0; i < count; i += 1) {
      const control = controls.nth(i);
      if ((await control.isDisabled()) || (await control.getAttribute("disabled")) !== null) {
        continue;
      }
      const tag = await control.evaluate((el) => el.tagName.toLowerCase());
      try {
        if (tag === "select") {
          const options = control.locator("option");
          const optionCount = await options.count();
          if (optionCount > 1) {
            const value = await options.nth(optionCount - 1).getAttribute("value");
            await control.selectOption(value ?? { index: optionCount - 1 });
          }
        } else {
          await control.click();
        }
      } catch {
        // A control may be covered or non-interactive in a given state;
        // the assertion that matters is the marker surviving the attempt.
      }
      await expect(marker).toBeVisible();
    }

    // The visualization itself is still displayed after all that.
    const chart = page.locator('[data-testid="fixture-view"] svg').first();
    await expect(chart).toBeVisible();
  });
});
