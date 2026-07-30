import { test, expect } from "@playwright/test";

test.describe("Dynamic Map Layers", () => {
  test("backend serves layer registry with dynamic layers", async ({ request }) => {
    const resp = await request.get("http://localhost:8000/api/layers");
    expect(resp.ok()).toBeTruthy();

    const data = await resp.json();
    expect(Array.isArray(data)).toBeTruthy();

    const layerIds = data.map((entry: any) => entry.layer_id);
    expect(layerIds).toContain("sea_level_rise_dynamic");
    expect(layerIds).toContain("power_gen_dynamic");
    expect(layerIds).toContain("water_access_dynamic");
  });

  test("sea level layer endpoint returns valid GeoJSON structure when available", async ({ request }) => {
    const resp = await request.get("http://localhost:8000/api/layers/sea_level");

    // Accept either 200 (available/stale) or 503 (unavailable)
    expect([200, 503]).toContain(resp.status());

    const data = await resp.json();
    expect(data).toHaveProperty("layer", "sea_level");
    expect(data).toHaveProperty("status");

    if (resp.status() === 503) {
      expect(data.status).toBe("unavailable");
      expect(data.data).toBeNull();
      expect(data).toHaveProperty("error");
    } else {
      expect(["available", "stale"]).toContain(data.status);
    }
  });

  test("power gen layer endpoint returns valid response", async ({ request }) => {
    const resp = await request.get("http://localhost:8000/api/layers/power_gen");
    expect([200, 503]).toContain(resp.status());

    const data = await resp.json();
    expect(data).toHaveProperty("layer", "power_gen");
    expect(data).toHaveProperty("status");
  });

  test("water access layer endpoint returns valid response", async ({ request }) => {
    const resp = await request.get("http://localhost:8000/api/layers/water_access");
    expect([200, 503]).toContain(resp.status());

    const data = await resp.json();
    expect(data).toHaveProperty("layer", "water_access");
    expect(data).toHaveProperty("status");
  });

  test("chatbot-context endpoint returns layer availability", async ({ request }) => {
    const resp = await request.get("http://localhost:8000/api/chatbot-context");
    expect(resp.ok()).toBeTruthy();

    const data = await resp.json();
    expect(data).toHaveProperty("available_layers");
    expect(data).toHaveProperty("unavailable_layers");
    expect(Array.isArray(data.available_layers)).toBeTruthy();
    expect(Array.isArray(data.unavailable_layers)).toBeTruthy();
  });

  test("page loads with layer selector visible", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 15000 });

    // Dynamic Datasets section header
    await expect(page.getByText("Dynamic Datasets")).toBeVisible({ timeout: 5000 });

    // Dynamic layer buttons should be visible
    await expect(page.getByRole("button", { name: "Sea Level Rise (H3)", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Power Gen (GWh)", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Water Access", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Fiji CHVA Facilities", exact: true })).toBeVisible();
  });

  test("clicking Sea Level Rise layer button triggers layer toggle", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 15000 });

    await page.getByRole("button", { name: "Sea Level Rise (H3)", exact: true }).click();

    // The legend should show Sea Level Anomaly info
    await expect(page.getByText("Sea Level Anomaly")).toBeVisible({ timeout: 3000 });
  });

  test("dynamic layer toggles update the matching Mapbox layer visibility", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 20000 });

    const layers = [
      { button: "Sea Level Rise (H3)", legend: "Sea Level Anomaly", mapLayer: "sea-level-h3-layer" },
      { button: "Power Gen (GWh)", legend: "Power Generation (GWh)", mapLayer: "power-gen-fill-layer" },
      { button: "Water Access", legend: "Safe Water Access", mapLayer: "water-access-fill-layer" },
      { button: "Fiji CHVA Facilities", legend: "CHVA facility types", mapLayer: "chva-facilities-layer" },
    ];

    for (const layer of layers) {
      await page.getByRole("button", { name: layer.button, exact: true }).click();
      await expect(page.getByText(layer.legend, { exact: true })).toBeVisible();
      await expect.poll(async () => page.evaluate((layerId) => {
        const map = (window as any).__map;
        return map?.getLayoutProperty(layerId, "visibility");
      }, layer.mapLayer)).toBe("visible");
    }
  });

  test.skip("starter prompts include new dataset prompts (gh issue #3)", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 15000 });

    // Check for the new starter prompts
    await expect(page.getByText("Sea Level", { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Power Assets", { exact: true })).toBeVisible();
    await expect(page.getByText("Water Access", { exact: true })).toBeVisible();
  });
});
