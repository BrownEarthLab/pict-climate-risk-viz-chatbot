/**
 * Population small-multiples fixture (tasks.md 3.4): a GENERIC-region time
 * series — one small chart per region, shared scales, read by comparison —
 * shaped like what issue #11's official PDH population data would produce,
 * but with generic region labels (Region A, Region B, …) and literal values.
 *
 * Decision 4: never a real name. The Natural Earth POP_EST data in the repo
 * is country-level only, which is precisely why this fixture still exists
 * (research.md → Superseded claims); synthetic values attached to real
 * country names would be the dangerous state this change exists to prevent.
 */
import { FIXTURE_SENTINEL } from "./sentinel";
import type { Provenance } from "../dataviz/provenance";

export interface PopulationPoint {
  year: number;
  value: number;
}

export interface PopulationSeries {
  region: string;
  points: PopulationPoint[];
}

export interface PopulationFixtureDataset {
  id: string;
  title: string;
  /** Decision 2: required, no default, and always "fixture" here. */
  provenance: Provenance;
  /** Bundle-guard sentinel — any fixture bundled carries this literal. */
  marker: string;
  series: PopulationSeries[];
}

export const populationFixtures: PopulationFixtureDataset[] = [
  {
    id: "population-small",
    title: "Generic-region population time series (4 regions)",
    provenance: "fixture",
    marker: FIXTURE_SENTINEL,
    series: [
      {
        region: "Region A",
        points: [
          { year: 2016, value: 12.4 },
          { year: 2017, value: 12.9 },
          { year: 2018, value: 13.2 },
          { year: 2019, value: 13.6 },
          { year: 2020, value: 14.1 },
          { year: 2021, value: 14.5 },
        ],
      },
      {
        region: "Region B",
        points: [
          { year: 2016, value: 7.1 },
          { year: 2017, value: 7.2 },
          { year: 2018, value: 7.4 },
          { year: 2019, value: 7.5 },
          { year: 2020, value: 7.8 },
          { year: 2021, value: 8.0 },
        ],
      },
      {
        region: "Region C",
        points: [
          { year: 2016, value: 20.8 },
          { year: 2017, value: 21.2 },
          { year: 2018, value: 21.5 },
          { year: 2019, value: 21.9 },
          { year: 2020, value: 22.4 },
          { year: 2021, value: 23.1 },
        ],
      },
      {
        region: "Region D",
        points: [
          { year: 2016, value: 3.9 },
          { year: 2017, value: 4.0 },
          { year: 2018, value: 4.2 },
          { year: 2019, value: 4.3 },
          { year: 2020, value: 4.4 },
          { year: 2021, value: 4.6 },
        ],
      },
    ],
  },
  {
    id: "population-large",
    title: "Generic-region population time series (6 regions)",
    provenance: "fixture",
    marker: FIXTURE_SENTINEL,
    series: [
      {
        region: "Region A",
        points: [
          { year: 2014, value: 11.8 },
          { year: 2016, value: 12.4 },
          { year: 2018, value: 13.2 },
          { year: 2020, value: 14.1 },
          { year: 2022, value: 15.0 },
        ],
      },
      {
        region: "Region B",
        points: [
          { year: 2014, value: 6.8 },
          { year: 2016, value: 7.1 },
          { year: 2018, value: 7.4 },
          { year: 2020, value: 7.8 },
          { year: 2022, value: 8.2 },
        ],
      },
      {
        region: "Region C",
        points: [
          { year: 2014, value: 20.1 },
          { year: 2016, value: 20.8 },
          { year: 2018, value: 21.5 },
          { year: 2020, value: 22.4 },
          { year: 2022, value: 23.6 },
        ],
      },
      {
        region: "Region D",
        points: [
          { year: 2014, value: 3.6 },
          { year: 2016, value: 3.9 },
          { year: 2018, value: 4.2 },
          { year: 2020, value: 4.4 },
          { year: 2022, value: 4.7 },
        ],
      },
      {
        region: "Region E",
        points: [
          { year: 2014, value: 9.4 },
          { year: 2016, value: 9.8 },
          { year: 2018, value: 10.3 },
          { year: 2020, value: 10.9 },
          { year: 2022, value: 11.4 },
        ],
      },
      {
        region: "Region F",
        points: [
          { year: 2014, value: 5.1 },
          { year: 2016, value: 5.3 },
          { year: 2018, value: 5.6 },
          { year: 2020, value: 5.9 },
          { year: 2022, value: 6.2 },
        ],
      },
    ],
  },
];
