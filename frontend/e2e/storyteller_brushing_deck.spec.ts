import { test, expect } from "@playwright/test";

test.describe("Storyteller Deck & Linked Brushing Visualization", () => {
  test("renders 4-chapter narrative storyteller deck bar", async ({ page }) => {
    await page.goto("http://localhost:5174/");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 20000 });

    // Verify Chapter buttons are visible
    await expect(page.getByRole("button", { name: "Ch. 1: The Heat Frontier" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ch. 2: Lifelines Under Threat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ch. 3: Pacific Resilience" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ch. 4: Open AI Exploration" })).toBeVisible();
  });

  test("clicking chapter buttons updates narrative content and provenance", async ({ page }) => {
    await page.goto("http://localhost:5174/");
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 15000 });

    // Click Chapter 2
    await page.getByRole("button", { name: "Ch. 2: Lifelines Under Threat" }).click();
    await expect(page.getByText("Fiji CHVA Facilities")).toBeVisible();
    await expect(page.getByText("111 Healthcare Clinics & Subdivisional Hospitals")).toBeVisible();
    await expect(page.getByText("Source: Fiji CHVA Healthcare Assessment & Pacific Data Hub")).toBeVisible();

    // Click Chapter 3
    await page.getByRole("button", { name: "Ch. 3: Pacific Resilience" }).click();
    await expect(page.getByText("Official PDH SDMX Indicators")).toBeVisible();
    await expect(page.getByText("Renewable Power & Water Access Progress")).toBeVisible();
    await expect(page.getByText("Source: Pacific Data Hub (PDH) SDMX API / Pacific Community (SPC)")).toBeVisible();
  });

  test("renders linked D3 risk charts and bivariate legend toggle", async ({ page }) => {
    await page.goto("http://localhost:5174/");
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
});
