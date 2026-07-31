/**
 * Workbench renders components in isolation (tests.md "Component rendering";
 * spec "Workbench Renders Components In Isolation"). Each component renders
 * with no map instance and no narrative state present, the rose chart
 * encodes value as AREA (`d3.scaleRadial`, not `scaleLinear`), the hotspot
 * layer renders every literal class from the fixture, and the gallery
 * controls re-render a component when its input changes.
 */
import { test, expect } from "@playwright/test";

test.describe("Workbench component isolation and rendering", () => {
  test("components render with no map instance and no narrative state", async ({ page }) => {
    await page.goto("/workbench.html");

    await expect(page.getByTestId("rose-chart")).toBeVisible();
    await expect(page.getByTestId("hotspot-layer")).toBeVisible();
    await expect(page.getByTestId("population-small-multiples")).toBeVisible();

    // No map instance: the workbench must not touch the application's map
    // (spec: "no map instance ... present").
    const mapInstance = await page.evaluate(
      () => !!(window as any).__mapboxMap || !!document.querySelector(".mapboxgl-map"),
    );
    expect(mapInstance).toBe(false);

    // No narrative state: no chapter/splash/narrative controls, no map
    // control surface.
    const narrativeControls = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll("[data-testid]")).map((el) =>
        el.getAttribute("data-testid"),
      );
      return ids.filter((id) => /enter-narrative|chapter|splash|map/.test(id ?? ""));
    });
    expect(narrativeControls).toEqual([]);
  });

  test("the rose chart renders one petal per fixture axis and encodes value as area", async ({
    page,
  }) => {
    await page.goto("/workbench.html");

    // Scope to the FIXTURE rose chart: the promotion-rehearsal view renders
    // a second rose chart (real data, ~95 petals) with the same component
    // testid. The fixture view is the 8-axis one.
    const fixtureRose = page.locator('[data-testid="fixture-view"] [data-testid="rose-chart"]');
    const petals = fixtureRose.locator("path[data-value]");
    await expect(petals.first()).toBeVisible();

    // One petal per axis in the default fixture variant (8 axes, Region A–H).
    await expect(petals).toHaveCount(8);

    // scaleRadial: area is proportional to value. Two petals whose values
    // differ by a factor of two must have areas differing by ~2x, not ~4x
    // (tests.md "Rose chart encoding honesty").
    const areas = await fixtureRose.evaluate((svg) => {
      const out: Record<string, number> = {};
      const paths = Array.from(svg.querySelectorAll("path[data-value]"));
      for (const p of paths) {
        const value = p.getAttribute("data-value");
        const box = (p as SVGGraphicsElement).getBBox();
        out[value!] = box.width * box.height;
      }
      return out;
    });

    const geometry = await fixtureRose.evaluate((svg) => {
      const svgBox = svg.getBoundingClientRect();
      const petalBoxes = Array.from(svg.querySelectorAll("path[data-value]")).map((path) => {
        const box = (path as SVGGraphicsElement).getBoundingClientRect();
        return {
          left: box.left - svgBox.left,
          top: box.top - svgBox.top,
          right: box.right - svgBox.left,
          bottom: box.bottom - svgBox.top,
        };
      });
      const origins = Array.from(svg.querySelectorAll("path[data-value]")).map((path) => {
        const matrix = (path as SVGGraphicsElement).getCTM();
        return { x: matrix?.e ?? NaN, y: matrix?.f ?? NaN };
      });
      return { width: svgBox.width, height: svgBox.height, petalBoxes, origins };
    });

    for (const box of geometry.petalBoxes) {
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.top).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(geometry.width + 1);
      expect(box.bottom).toBeLessThanOrEqual(geometry.height + 1);
    }
    for (const origin of geometry.origins) {
      expect(origin.x).toBeCloseTo(geometry.width / 2, 0);
      expect(origin.y).toBeCloseTo(geometry.height / 2, 0);
    }

    expect(areas["10"]).toBeGreaterThan(0);
    expect(areas["20"]).toBeGreaterThan(0);
    const ratio = Math.max(areas["20"], areas["10"]) / Math.min(areas["20"], areas["10"]);
    // Area ratio for a 2x value ratio sits near 2 under scaleRadial; scaleLinear
    // would give ~4. Generous bounds to keep the assertion robust to bbox shape.
    expect(ratio).toBeGreaterThan(1.4);
    expect(ratio).toBeLessThan(3.2);
  });

  test("the hotspot layer renders every class present in the fixture", async ({ page }) => {
    await page.goto("/workbench.html");

    // Default variant spans 3 classes.
    const legend = page.getByTestId("hotspot-legend");
    await expect(legend).toBeVisible();
    await expect(legend).toContainText("Class 1");
    await expect(legend).toContainText("Class 2");
    await expect(legend).toContainText("Class 3");

    // Every rendered feature carries one of the fixture's literal classes.
    // (Return an array — page.evaluate cannot serialize a Set.)
    const renderedClasses = await page.evaluate(() => {
      const paths = Array.from(
        document.querySelectorAll('[data-testid="hotspot-layer"] path[data-class]'),
      );
      return Array.from(new Set(paths.map((p) => p.getAttribute("data-class"))));
    });
    expect(renderedClasses.length).toBeGreaterThanOrEqual(3);
    for (const c of ["Class 1", "Class 2", "Class 3"]) {
      expect(renderedClasses).toContain(c);
    }
  });

  test("changing a component's input via the controls re-renders it", async ({ page }) => {
    await page.goto("/workbench.html");

    // Hotspot: switch 3 → 5 classes and the legend + layer re-render.
    const classSelect = page.getByTestId("hotspot-class-count");
    await classSelect.selectOption("5");
    const legend = page.getByTestId("hotspot-legend");
    await expect(legend).toContainText("Class 4");
    await expect(legend).toContainText("Class 5");
    await expect(legend).not.toContainText("Class 6");

    const renderedClasses = await page.evaluate(() => {
      const paths = Array.from(
        document.querySelectorAll('[data-testid="hotspot-layer"] path[data-class]'),
      );
      return Array.from(new Set(paths.map((p) => p.getAttribute("data-class"))));
    });
    expect(renderedClasses).toHaveLength(5);

    // Rose: switch to the larger variant and the petal count changes.
    const roseSelect = page.getByTestId("rose-variant");
    await roseSelect.selectOption("rose-large");
    await expect(
      page.locator('[data-testid="fixture-view"] [data-testid="rose-chart"] path[data-value]'),
    ).toHaveCount(12);
  });
});
