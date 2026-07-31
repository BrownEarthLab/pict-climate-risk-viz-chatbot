/**
 * Workbench containment, runtime half (tests.md "Containment"; spec
 * "Fixture Data Is Confined To The Workbench Entry" and "Every Dataset
 * Declares Its Provenance"). The build-time half is `npm run
 * test:bundle-guard`; this spec exercises the application-entry runtime
 * guard:
 *
 *   - a dataset flagged `provenance: "fixture"` raises an error in the
 *     application entry rather than rendering;
 *   - a dataset omitting `provenance` entirely is rejected with an error
 *     naming the dataset;
 *   - a dataset flagged `"real"` renders with no watermark.
 *
 * The guard is exercised through the network: intercept the application's
 * dataset fetch and fulfill it with a tampered payload, then assert on the
 * surfaced error. The application surfaces load/classification errors loudly
 * in `[data-testid="classification-error"]` (role=alert).
 */
import { test, expect } from "@playwright/test";

const DATASET_URL = "**/data/pict_bivariate.geojson";

function geojsonPayload(provenance?: "real" | "fixture") {
  const payload: Record<string, unknown> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { id: "1", name: "Example", water_access_pct: 10, pop_est: 1000 },
        geometry: { type: "Point", coordinates: [178, -18] },
      },
    ],
  };
  if (provenance !== undefined) {
    payload.provenance = provenance;
  }
  return payload;
}

test.describe("Application-entry provenance containment", () => {
  test("a dataset flagged provenance 'fixture' raises an error rather than rendering", async ({
    page,
  }) => {
    await page.route(DATASET_URL, (route) =>
      route.fulfill({ json: geojsonPayload("fixture") }),
    );

    await page.goto("/");

    const alert = page.getByTestId("classification-error");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/provenance/i);
    await expect(alert).toContainText(/fixture/i);
    // The offending dataset is named, so the failure is attributable.
    await expect(alert).toContainText("pict-water-pop");
  });

  test("a dataset omitting provenance is rejected with an error naming it", async ({ page }) => {
    await page.route(DATASET_URL, (route) => route.fulfill({ json: geojsonPayload() }));

    await page.goto("/");

    const alert = page.getByTestId("classification-error");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/provenance/i);
    await expect(alert).toContainText("pict-water-pop");
  });

  test("a dataset flagged 'real' renders with no watermark", async ({ page }) => {
    // No interception: the served real datasets declare `provenance: "real"`.
    await page.goto("/");

    await page.waitForFunction(() => !!(window as any).__mapboxMap, undefined, {
      timeout: 30000,
    });

    // Real data passes through unmodified: no synthetic-data marker anywhere.
    await expect(page.getByTestId("fixture-watermark")).toHaveCount(0);
    await expect(page.getByTestId("classification-error")).toBeHidden();
  });
});
