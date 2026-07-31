/**
 * Shared helpers for the bivariate viz e2e suite.
 * Standing rule (tests.md): assertions about the map query the map —
 * getSource / getLayoutProperty / querySourceFeatures / getFeatureState —
 * never React state.
 */
import type { Page } from "@playwright/test";

export const BIVARIATE_LAYER_IDS = [
  "bivariate-pict-water-pop-fill",
  "bivariate-pict-sea-level-fill",
  "bivariate-pict-subregion-pop-fill",
  "bivariate-fiji-heat-variability-fill",
];

export async function waitForMap(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !!(window as any).__mapboxMap,
    undefined,
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () => {
      const m = (window as any).__mapboxMap;
      return m && m.isStyleLoaded();
    },
    undefined,
    { timeout: 30000 },
  );
}

/** Enter the narrative and wait until the first chapter's source has features. */
export async function enterNarrative(page: Page): Promise<void> {
  await waitForMap(page);
  await page.getByTestId("enter-narrative").click();
  await page.waitForFunction(
    () => {
      const m = (window as any).__mapboxMap;
      if (!m) return false;
      const source = m.getSource("bivariate-pict-water-pop");
      return source && m.querySourceFeatures("bivariate-pict-water-pop").length > 0;
    },
    undefined,
    { timeout: 20000 },
  );
}

export async function visibleBivariateLayers(page: Page): Promise<string[]> {
  return page.evaluate((layerIds) => {
    const m = (window as any).__mapboxMap;
    return layerIds.filter(
      (id: string) => m.getLayer(id) && m.getLayoutProperty(id, "visibility") === "visible",
    );
  }, BIVARIATE_LAYER_IDS);
}

export async function uniqueSourceIds(page: Page, sourceId: string): Promise<string[]> {
  return page.evaluate((sid) => {
    const m = (window as any).__mapboxMap;
    const features = m.querySourceFeatures(sid);
    const seen = new Set<string>();
    for (const f of features) {
      const id = f.properties?.id ?? f.id;
      if (typeof id === "string") seen.add(id);
    }
    return Array.from(seen);
  }, sourceId);
}

export async function highlightedFeatureIds(page: Page, sourceId: string): Promise<string[]> {
  const ids = await uniqueSourceIds(page, sourceId);
  return page.evaluate(
    ({ sid, ids }) => {
      const m = (window as any).__mapboxMap;
      return ids.filter(
        (id: string) => m.getFeatureState({ source: sid, id }).highlighted === true,
      );
    },
    { sid: sourceId, ids },
  );
}

/** Assert a feature state directly by its stable id (viewport-independent). */
export async function featureHighlighted(
  page: Page,
  sourceId: string,
  featureId: string,
): Promise<boolean> {
  return page.evaluate(
    ({ sid, fid }) => {
      const m = (window as any).__mapboxMap;
      return m.getFeatureState({ source: sid, id: fid }).highlighted === true;
    },
    { sid: sourceId, fid: featureId },
  );
}
