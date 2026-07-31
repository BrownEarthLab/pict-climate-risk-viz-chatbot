/**
 * These tests target the legacy analysis workspace, which the bivariate
 * scrollytelling change moved from "/" to "/#workspace" (see App.jsx). The root
 * path now opens the splash view, which deliberately does NOT show the layer
 * control surface — spec: scrollytelling-narrative-frame, "Opening Splash Screen
 * Is Minimal". Retargeting the route is the correct fix; making the controls
 * visible at "/" would violate that requirement.
 */
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
    await page.goto("/#workspace");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 15000 });

    // Dynamic Datasets section header
    await expect(page.getByText("Dynamic Datasets")).toBeVisible({ timeout: 5000 });

    // Dynamic layer buttons should be visible
    await expect(page.getByRole("button", { name: "Sea Level Rise (H3)", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Power Gen (GWh)", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Water Access", exact: true })).toBeVisible();
  });

  test("clicking Sea Level Rise layer button triggers layer toggle", async ({ page }) => {
    await page.goto("/#workspace");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 15000 });

    await page.getByRole("button", { name: "Sea Level Rise (H3)", exact: true }).click();

    // The legend should show Sea Level Anomaly info
    await expect(page.getByText("Sea Level Anomaly")).toBeVisible({ timeout: 3000 });
  });

  test.skip("starter prompts include new dataset prompts (gh issue #3)", async ({ page }) => {
    await page.goto("/#workspace");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 15000 });

    // Check for the new starter prompts
    await expect(page.getByText("Sea Level", { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Power Assets", { exact: true })).toBeVisible();
    await expect(page.getByText("Water Access", { exact: true })).toBeVisible();
  });
});
