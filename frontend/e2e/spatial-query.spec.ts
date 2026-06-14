import { test, expect } from "@playwright/test";

const TEST_POLYGON = {
  type: "Polygon",
  coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
};

test.describe("Spatial Query End-to-End", () => {
  test("activates draw mode and shows instruction UI", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 15000 });

    await page.getByText("Draw for Spatial Query").dispatchEvent("click");

    await expect(
      page.getByText("Draw a polygon, line, or point")
    ).toBeVisible({ timeout: 3000 });
  });

  test("backend receives polygon coordinates and echoes them back", async ({ request }) => {
    const resp = await request.post("http://localhost:8000/api/spatial-query", {
      data: {
        drawn_boundary: TEST_POLYGON,
        target_layers: ["Backend Received Polygon"],
      },
    });

    expect(resp.ok()).toBeTruthy();

    const data = await resp.json();
    expect(data).toHaveProperty("type", "FeatureCollection");
    expect(data.features).toHaveLength(1);

    const feature = data.features[0];
    expect(feature.properties).toHaveProperty("layer_name", "Backend Received Polygon");
    expect(feature.properties.description).toContain("Successfully received geometry of type Polygon");
    expect(feature.properties.description).toContain("5 coordinates");
  });

  test("spatial query flow: draw polygon and see confirmation in panel", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 15000 });

    // Activate draw mode
    await page.getByText("Draw for Spatial Query").dispatchEvent("click");
    await page.waitForTimeout(300);

    // Click the polygon button
    await page.locator(".mapbox-gl-draw_polygon").waitFor({ state: "attached", timeout: 5000 });
    await page.locator(".mapbox-gl-draw_polygon").dispatchEvent("click");
    await page.waitForTimeout(300);

    // Add a polygon programmatically via the exposed MapboxDraw instance
    await page.waitForFunction(() => !!(window as any).__mapboxDraw && !!(window as any).__mapboxMap, { timeout: 5000 });
    
    // Set up the response listener BEFORE we evaluate to avoid race conditions
    const respPromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/spatial-query") && resp.status() === 200
    );

    await page.evaluate(() => {
      const draw = (window as any).__mapboxDraw;
      const map = (window as any).__mapboxMap;

      const featureIds = draw.add({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        properties: {},
      });

      // Manually trigger the draw.create event on the map so our component handler fires
      map.fire("draw.create", {
        features: [draw.get(featureIds[0])]
      });
    });

    // Wait for the spatial query request
    await respPromise;
    await page.waitForTimeout(500);

    // Verify the panel shows backend response
    await expect(page.getByText(/successfully received geometry/i)).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("Backend Received Polygon")).toBeVisible({ timeout: 3000 });
  });
});
