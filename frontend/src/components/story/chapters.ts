/**
 * Narrative chapters (spec: One Encoding Visible Per Chapter). Each chapter
 * declares exactly ONE encoding (dataset + mode), a camera position, and the
 * geographic scale of its features.
 */
import type { BivariateMode } from "../../dataviz/datasetDefinitions";

export interface Chapter {
  id: string;
  title: string;
  narrative: string;
  datasetId: string;
  mode: BivariateMode;
  geographicScale: "fiji-cells" | "pict-country";
  camera: { center: [number, number]; zoom: number };
}

export const CHAPTERS: Chapter[] = [
  {
    id: "water-pop",
    title: "Safe water access × population",
    narrative:
      "Where is the burden largest? Countries with the lowest safe water access and the largest populations face the hardest adaptation problem. Click a legend cell to brush the map and the charts.",
    datasetId: "pict-water-pop",
    mode: "sequential-sequential",
    geographicScale: "pict-country",
    camera: { center: [170, -15], zoom: 1.8 },
  },
  {
    id: "sea-level",
    title: "Sea level anomaly × indicator deviation",
    narrative:
      "How far does each country sit from the regional norm? The diverging scale centers on the norm — zero deviation from the Pacific median sea level anomaly, and zero deviation from the median safe water access.",
    datasetId: "pict-sea-level",
    mode: "diverging-diverging",
    geographicScale: "pict-country",
    camera: { center: [170, -15], zoom: 1.8 },
  },
  {
    id: "subregion-pop",
    title: "Subregion × population",
    narrative:
      "Melanesia, Polynesia, and Micronesia carry different population weights. Each subregion gets its own hue; the sequential axis carries population.",
    datasetId: "pict-subregion-pop",
    mode: "qualitative-sequential",
    geographicScale: "pict-country",
    camera: { center: [170, -15], zoom: 1.8 },
  },
];
