/**
 * Rose-chart fixture (tasks.md 3.2): a per-region indicator across
 * categories, shaped exactly like what issue #10's sub-national tuberculosis
 * data would produce — but with GENERIC axis labels (Region A, Region B, …).
 *
 * Decision 4 is the load-bearing safeguard: a rose chart labelled
 * "Region A / Region B" is self-evidently a mockup; one labelled
 * "Ba / Nadroga / Rewa" with invented rates looks exactly like research
 * output. The values are literal data, not computed.
 *
 * The `rose-small` variant carries a 2:1 value pair (Region A = 10,
 * Region B = 20) so the encoding-honesty assertion in tests.md — petal
 * AREA, not radius, scales with value (d3.scaleRadial) — can be exercised.
 */
import { FIXTURE_SENTINEL } from "./sentinel";
import type { Provenance } from "../dataviz/provenance";

export interface RoseDatum {
  /** Generic axis label — a category or indicator dimension, never a place. */
  axis: string;
  /** Literal synthetic value for the axis. */
  value: number;
}

export interface RoseFixtureDataset {
  id: string;
  title: string;
  /** Decision 2: required, no default, and always "fixture" here. */
  provenance: Provenance;
  /** Bundle-guard sentinel — any fixture bundled carries this literal. */
  marker: string;
  rows: RoseDatum[];
}

export const roseFixtures: RoseFixtureDataset[] = [
  {
    id: "rose-small",
    title: "Per-region indicator across categories (8 regions)",
    provenance: "fixture",
    marker: FIXTURE_SENTINEL,
    rows: [
      { axis: "Region A", value: 10 },
      { axis: "Region B", value: 20 },
      { axis: "Region C", value: 15 },
      { axis: "Region D", value: 30 },
      { axis: "Region E", value: 40 },
      { axis: "Region F", value: 20 },
      { axis: "Region G", value: 50 },
      { axis: "Region H", value: 60 },
    ],
  },
  {
    id: "rose-large",
    title: "Per-region indicator across categories (12 regions)",
    provenance: "fixture",
    marker: FIXTURE_SENTINEL,
    rows: [
      { axis: "Region A", value: 12 },
      { axis: "Region B", value: 26 },
      { axis: "Region C", value: 9 },
      { axis: "Region D", value: 33 },
      { axis: "Region E", value: 18 },
      { axis: "Region F", value: 41 },
      { axis: "Region G", value: 7 },
      { axis: "Region H", value: 22 },
      { axis: "Region I", value: 15 },
      { axis: "Region J", value: 38 },
      { axis: "Region K", value: 24 },
      { axis: "Region L", value: 11 },
    ],
  },
];
