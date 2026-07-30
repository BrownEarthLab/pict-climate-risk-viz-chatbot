import { test, expect } from "@playwright/test";

test.describe("Storyteller Deck & Linked Brushing Visualization", () => {
  test("renders 4-chapter narrative storyteller deck bar", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 20000 });

    // Verify Chapter buttons are visible
    await expect(page.getByRole("button", { name: "Ch. 1: The Heat Frontier" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ch. 2: Lifelines Under Threat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ch. 3: Pacific Resilience" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ch. 4: Open AI Explorer Mode" })).toBeVisible();
  });

  test("clicking chapter buttons updates narrative content and provenance", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 15000 });

    // Click Chapter 2 — "Fiji CHVA Facilities" is both the chapter badge and the
    // layer-toggle button label, so scope this to the badge.
    await page.getByRole("button", { name: "Ch. 2: Lifelines Under Threat" }).click();
    await expect(
      page.locator("span").filter({ hasText: "Fiji CHVA Facilities" })
    ).toBeVisible();
    await expect(page.getByText("111 Healthcare Clinics & Subdivisional Hospitals")).toBeVisible();
    await expect(page.getByText("Source: Fiji CHVA Healthcare Assessment & Pacific Data Hub")).toBeVisible();

    // Click Chapter 3
    await page.getByRole("button", { name: "Ch. 3: Pacific Resilience" }).click();
    await expect(page.getByText("Official PDH SDMX Indicators")).toBeVisible();
    await expect(page.getByText("Renewable Power & Water Access Progress")).toBeVisible();
    await expect(page.getByText("Source: Pacific Data Hub (PDH) SDMX API / Pacific Community (SPC)")).toBeVisible();
  });

  test("renders linked D3 risk charts and bivariate legend toggle", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 15000 });

    // Verify Linked Exposure Scatterplot heading
    await expect(page.getByText("Linked Exposure Scatterplot")).toBeVisible();

    // Click Show Bivariate Palette
    const paletteBtn = page.getByRole("button", { name: "Show Bivariate Palette" });
    await expect(paletteBtn).toBeVisible();
    await paletteBtn.click();

    // Bivariate palette legend matrix should be visible
    await expect(page.getByText("Bivariate 3×3 Palette (Heat Hazard × Climate Uncertainty)")).toBeVisible();
  });

  test("serves the CHVA facilities layer as GeoJSON", async ({ request }) => {
    const response = await request.get("http://localhost:8000/api/layers/chva_facilities");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("available");
    expect(body.data.type).toBe("FeatureCollection");
    expect(body.data.features.length).toBeGreaterThan(0);

    // The feature id contract the map's promoteId and the D3 charts both rely on.
    const [first] = body.data.features;
    expect(first.properties.facility_id).toMatch(/^chva-\d+$/);
    expect(first.id).toBe(first.properties.facility_id);
  });

  test("dynamic layer toggles render their matching legend", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 20000 });

    await page.getByRole("button", { name: "Sea Level Rise (H3)" }).click();
    await expect(page.getByText("Sea Level Anomaly")).toBeVisible();

    await page.getByRole("button", { name: "Fiji CHVA Facilities" }).click();
    await expect(page.getByText("CHVA facility types")).toBeVisible();
    await expect(page.getByText("Sea Level Anomaly")).toBeHidden();
  });

  test("Explore Freely clears the active layer and its legend", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 20000 });

    await page.getByRole("button", { name: "Ch. 2: Lifelines Under Threat" }).click();
    await expect(page.getByText("CHVA facility types")).toBeVisible();

    await page.getByRole("button", { name: "Explore Freely" }).click();
    await expect(page.getByText("CHVA facility types")).toBeHidden();
  });

  test("chart brushing sets and clears Mapbox feature state", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 20000 });
    await page.getByRole("button", { name: "Fiji CHVA Facilities", exact: true }).click();
    await expect.poll(async () => page.evaluate(() => Boolean(
      (window as any).__map?.getSource("chva-facilities")
    ))).toBe(true);
    const chart = page.getByTestId("linked-histogram");
    const brushOverlay = chart.locator("rect.overlay");
    const box = await brushOverlay.boundingBox();
    expect(box).not.toBeNull();

    // Select the first chart point's temperature bin (chva-1: 31.5°C).
    const x0 = (box?.x ?? 0) + 20;
    const y0 = (box?.y ?? 0) + 5;
    const x1 = (box?.x ?? 0) + 110;
    const y1 = (box?.y ?? 0) + 45;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x1, y1, { steps: 4 });
    await page.mouse.up();
    const brushDebug = await page.evaluate(() => ({
      selection: document.querySelector('[data-testid="linked-histogram"] rect.selection')?.getAttribute("x"),
      firstOpacity: document.querySelector('[data-testid="linked-scatterplot"] circle.dot')?.getAttribute("opacity"),
    }));
    console.log("brush debug", brushDebug);

    await expect.poll(async () => page.evaluate(() => (
      (window as any).__map?.getFeatureState({ source: "chva-facilities", id: "chva-1" })
    ))).toMatchObject({ highlighted: true });

    // Clicking outside the brush clears the selection and the GPU state.
    await page.mouse.click((box?.x ?? 0) + 220, (box?.y ?? 0) + 90);
    await expect.poll(async () => page.evaluate(() => (
      (window as any).__map?.getFeatureState({ source: "chva-facilities", id: "chva-1" })
    ))).not.toMatchObject({ highlighted: true });
  });

  test("map hover and click update the linked chart without feedback loops", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 20000 });
    await page.getByRole("button", { name: "Fiji CHVA Facilities", exact: true }).click();
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const map = (window as any).__map;
      if (!map) throw new Error("Mapbox debug handle was not exposed");
      const originalSetFeatureState = map.setFeatureState.bind(map);
      map.__setFeatureStateCalls = 0;
      map.setFeatureState = (...args: any[]) => {
        map.__setFeatureStateCalls += 1;
        return originalSetFeatureState(...args);
      };
      map.queryRenderedFeatures = () => [{
        id: "chva-1",
        properties: {
          facility_id: "chva-1",
          facility_name: "Vunisea Subdivisional Hospital",
          facility_type: "Hospital",
          vulnerability: "High",
        },
      }];
    });
    const canvas = page.locator(".mapboxgl-canvas");
    const canvasBox = await canvas.boundingBox();
    await page.mouse.move((canvasBox?.x ?? 0) + 20, (canvasBox?.y ?? 0) + 20);

    const firstDot = page.getByTestId("linked-scatterplot").locator("circle.dot").first();
    await expect(firstDot).toHaveAttribute("stroke", "#0a0a0a");

    await page.evaluate(() => {
      const map = (window as any).__map;
      map.queryRenderedFeatures = () => [];
    });
    await page.mouse.move((canvasBox?.x ?? 0) + 200, (canvasBox?.y ?? 0) + 160);
    await expect(firstDot).toHaveAttribute("stroke", "none");

    await page.evaluate(() => {
      const map = (window as any).__map;
      map.queryRenderedFeatures = () => [{
        id: "chva-1",
        properties: { facility_id: "chva-1" },
      }];
    });
    await page.mouse.click((canvasBox?.x ?? 0) + 22, (canvasBox?.y ?? 0) + 22);
    await expect(firstDot).toHaveAttribute("stroke", "#ffffff");
    const callsAfterClick = await page.evaluate(() => (window as any).__map.__setFeatureStateCalls);
    await page.waitForTimeout(300);
    await expect.poll(async () => page.evaluate(() => (window as any).__map.__setFeatureStateCalls)).toBe(callsAfterClick);
  });
});
