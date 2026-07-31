/**
 * Climate Layer Toggles (spatial-map-viz modified requirement). Activating a
 * layer control sets the corresponding Mapbox layer's layout visibility to
 * `visible` and every other mutually exclusive thematic layer to `none` —
 * asserted through map state, independently of legend presence.
 */
import { test, expect } from "@playwright/test";
import { enterNarrative } from "./bivariate-helpers";

test.describe("Climate Layer Toggles", () => {
  test("activating a layer sets its Mapbox layout visibility to visible", async ({ page }) => {
    await page.goto("/");
    await enterNarrative(page);
    await page.getByTestId("free-exploration").click();
    await expect(page.getByTestId("climate-toggle-tas")).toBeVisible();

    await page.getByTestId("climate-toggle-tas").click();

    const visibility = await page.evaluate(() => {
      const m = (window as any).__mapboxMap;
      return m.getLayoutProperty("climate-temp-layer", "visibility");
    });
    expect(visibility).toBe("visible");
  });

  test("activating a layer hides the previously active one", async ({ page }) => {
    await page.goto("/");
    await enterNarrative(page);
    await page.getByTestId("free-exploration").click();

    await page.getByTestId("climate-toggle-tas").click();
    await page.getByTestId("climate-toggle-wet_bulb").click();

    const visibilities = await page.evaluate(() => {
      const m = (window as any).__mapboxMap;
      return {
        tas: m.getLayoutProperty("climate-temp-layer", "visibility"),
        wet: m.getLayoutProperty("wet-bulb-temp-layer", "visibility"),
      };
    });
    expect(visibilities.tas).toBe("none");
    expect(visibilities.wet).toBe("visible");
  });

  test("legend presence does not imply layer visibility", async ({ page }) => {
    await page.goto("/");
    await enterNarrative(page);

    // The bivariate legend is present in the narrative…
    await expect(page.getByRole("group", { name: "Bivariate legend" })).toBeVisible();

    // …but the tas/wet-bulb overlays are independently at `none` until toggled.
    const visibilities = await page.evaluate(() => {
      const m = (window as any).__mapboxMap;
      return {
        tas: m.getLayoutProperty("climate-temp-layer", "visibility"),
        wet: m.getLayoutProperty("wet-bulb-temp-layer", "visibility"),
      };
    });
    expect(visibilities.tas).toBe("none");
    expect(visibilities.wet).toBe("none");
  });
});
