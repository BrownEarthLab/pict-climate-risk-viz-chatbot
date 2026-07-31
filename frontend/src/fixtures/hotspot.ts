/**
 * Categorical hotspot fixture (tasks.md 3.3): REAL tikina geometry joined to
 * GENERIC class values. The legibility question this change exists to answer —
 * at what class count do categorical classes stop being distinguishable at a
 * glance — can only be exercised over real geometry, so this fixture spans 3,
 * 5, 8 and 16 classes (Open Question 2, resolved: 16 is the ESRI Emerging
 * Hot Spot Analysis count; the others bracket the threshold).
 *
 * Decision 4: the classes are named `Class 1`…`Class N`, NEVER the ESRI
 * category names — `Persistent Hot Spot` is the single most dangerous string
 * to put on a synthetic map. And per the spec's `The Workbench Computes No
 * Analysis`, every class value below is a LITERAL in the fixture, not a
 * value derived by any code: the assignments array is aligned by index with
 * the features of `/fiji_tikina.geojson` (the reference file, served
 * unchanged by the frontend). Contiguous index blocks of the file's
 * province-ordered features form contiguous geographic regions, so each class
 * is a coherent area — legibility, not noise, is what is being tested.
 */
import { FIXTURE_SENTINEL } from "./sentinel";
import type { Provenance } from "../dataviz/provenance";

export interface HotspotFixtureVariant {
  id: string;
  title: string;
  /** Decision 2: required, no default, and always "fixture" here. */
  provenance: Provenance;
  /** Bundle-guard sentinel — any fixture bundled carries this literal. */
  marker: string;
  /** Ordered class labels for the palette and legend. */
  classes: string[];
  /** Real geometry, served by the frontend unchanged. */
  geometryUrl: string;
  /**
   * Literal class per feature, aligned by INDEX with the features of
   * `geometryUrl`. The component reads these values directly; nothing here
   * computes a class.
   */
  assignments: string[];
}

export const hotspotFixtures: HotspotFixtureVariant[] = [
  {
    id: "hotspot-3",
    title: "Categorical hotspot classes over real tikina geometry (3 classes)",
    provenance: "fixture",
    marker: FIXTURE_SENTINEL,
    classes: ["Class 1", "Class 2", "Class 3"],
    geometryUrl: "/fiji_tikina.geojson",
    assignments: ["Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3"],
  },
  {
    id: "hotspot-5",
    title: "Categorical hotspot classes over real tikina geometry (5 classes)",
    provenance: "fixture",
    marker: FIXTURE_SENTINEL,
    classes: ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5"],
    geometryUrl: "/fiji_tikina.geojson",
    assignments: ["Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5"],
  },
  {
    id: "hotspot-8",
    title: "Categorical hotspot classes over real tikina geometry (8 classes)",
    provenance: "fixture",
    marker: FIXTURE_SENTINEL,
    classes: ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8"],
    geometryUrl: "/fiji_tikina.geojson",
    assignments: ["Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 6", "Class 6", "Class 6", "Class 6", "Class 6", "Class 6", "Class 6", "Class 6", "Class 6", "Class 6", "Class 6", "Class 7", "Class 7", "Class 7", "Class 7", "Class 7", "Class 7", "Class 7", "Class 7", "Class 7", "Class 7", "Class 7", "Class 8", "Class 8", "Class 8", "Class 8", "Class 8", "Class 8", "Class 8", "Class 8", "Class 8", "Class 8"],
  },
  {
    id: "hotspot-16",
    title: "Categorical hotspot classes over real tikina geometry (16 classes)",
    provenance: "fixture",
    marker: FIXTURE_SENTINEL,
    classes: ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12", "Class 13", "Class 14", "Class 15", "Class 16"],
    geometryUrl: "/fiji_tikina.geojson",
    assignments: ["Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 1", "Class 2", "Class 2", "Class 2", "Class 2", "Class 2", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 3", "Class 4", "Class 4", "Class 4", "Class 4", "Class 4", "Class 5", "Class 5", "Class 5", "Class 5", "Class 5", "Class 6", "Class 6", "Class 6", "Class 6", "Class 6", "Class 6", "Class 7", "Class 7", "Class 7", "Class 7", "Class 7", "Class 8", "Class 8", "Class 8", "Class 8", "Class 8", "Class 9", "Class 9", "Class 9", "Class 9", "Class 9", "Class 9", "Class 10", "Class 10", "Class 10", "Class 10", "Class 10", "Class 11", "Class 11", "Class 11", "Class 11", "Class 11", "Class 11", "Class 12", "Class 12", "Class 12", "Class 12", "Class 12", "Class 13", "Class 13", "Class 13", "Class 13", "Class 13", "Class 14", "Class 14", "Class 14", "Class 14", "Class 14", "Class 14", "Class 15", "Class 15", "Class 15", "Class 15", "Class 15", "Class 16", "Class 16", "Class 16", "Class 16", "Class 16"],
  },
];
