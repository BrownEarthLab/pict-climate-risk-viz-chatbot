# Technical Implementation Plan: Pacific Climate Risk Data Viz v2

## Goal Description
Build the next-generation Pacific Climate & Health Risk Visualization Platform (**Data Viz v2**), directly incorporating lab research notes and award-winning design patterns from the **Pacific DataViz Challenge** (Yan Holtz style). 

The application reuses existing H3 grid services, heat forecasts, SDMX indicators, and CHVA facility datasets while introducing four primary visualization breakthroughs:
1. **Space-Time Emerging Hotspot Analysis**: Classifying heat $\times$ health (e.g. Tuberculosis / CHVA vulnerability) trends into ESRI-defined categories (*New*, *Persistent*, *Historical*, *Sporadic* hotspots).
2. **D3 Nightingale Rose Charts (Circular Polar Area Graphs)**: Bi-directionally brushed circular graphs linked to country/province spatial features, highlighting multidimensional climate-health metrics.
3. **Interactive Bivariate Choropleth Legends**: Brushable 3x3 legends supporting *Diverging-Diverging* (center = norm baseline), *Sequential-Sequential*, and *Qualitative-Sequential* modes.
4. **Scrollytelling & Multi-Level Uncertainty Drill-Down**: Clean opening splash screen, country search bar, scrollytelling narrative steps, and box plots illustrating population exposure and forecast uncertainty.

---

## User Review Required

> [!IMPORTANT]
> **Data Sources & Hotspot Classification Strategy**:
> Space-time hotspot analysis requires multi-year quarterly/annual observations (e.g., 2018–2023). We will generate a structured space-time cube using the backend's existing `h3Binner.js` and SDMX/CHVA datasets, supplemented by a synthetic time-series generator for tuberculosis/health indicator trends across Pacific territories.

> [!TIP]
> **Aesthetic Principles (Pacific DataViz Challenge Style)**:
> - **Minimalist Splash Screen**: Clean, distraction-free hero start screen with search bar and story entry points.
> - **Zero Raw Attribute Slugs**: All tooltips and labels format metric names into human-readable titles with exact provenance.
> - **Intentional Color Palette**: High-contrast, colorblind-safe HSL palettes for bivariate choropleth and Rose chart petalling.

---

## Open Questions

> [!QUESTION]
> 1. **Default Initial Map View**: Should the initial screen load Fiji at Province level with Fiji CHVA facilities, or open on a Pacific-wide territory overview with the Search Bar enabled?
> 2. **TB / Health Data Granularity**: Would you like the Tuberculosis indicator to be mapped down to H3 resolution 6/7 cells or kept at administrative district/province level linked to health clinics?

---

## Target Context Map

| File Path | Target Line Ranges | Primary Responsibility |
| :--- | :--- | :--- |
| `backend/services/emergingHotspotService.js` | `[NEW]` Lines 1–180 | Compute space-time cluster statistics (Getis-Ord $Gi^*$) and assign ESRI hotspot categories (*New*, *Persistent*, *Historical*). |
| `backend/server.js` | Lines 4900–4980 | Expose `/api/hotspots` and `/api/health-indicators` REST endpoints. |
| `frontend/src/state/usePacificVizState.ts` | `[NEW]` Lines 1–120 | Central Zustand/React state manager for active hotspot category, Rose chart petal selection, bivariate mode, and uncertainty bounds. |
| `frontend/src/components/viz/NightingaleRoseChart.tsx` | `[NEW]` Lines 1–220 | D3.js circular polar area graph (Nightingale Rose chart) rendering multi-axis climate/health indicators with bi-directional hover/brushing. |
| `frontend/src/components/viz/BivariateLegend.tsx` | `[NEW]` Lines 1–160 | Interactive 3x3 bivariate legend supporting Diverging-Diverging, Sequential, and Qualitative modes with cell hover/brush listeners. |
| `frontend/src/components/viz/DrillDownBoxPlot.tsx` | `[NEW]` Lines 1–150 | Multi-level drill-down component displaying mean values, quartile box plots, and population exposure uncertainty spreads. |
| `frontend/src/components/story/ScrollytellingDeck.tsx` | `[NEW]` Lines 1–190 | Narrative scrollytelling controller with clean splash screen, country search bar, and step-by-step layer focus. |
| `frontend/src/components/map/MapCanvas.tsx` | Lines 850–980, 2550–2680 | Integrate space-time hotspot vector layers, bivariate choropleths, and circular graph brushing event handlers into Mapbox GL. |
| `frontend/e2e/pacific_viz_v2.spec.ts` | `[NEW]` Lines 1–100 | E2E Playwright test suite validating Rose chart interaction, hotspot filtering, bivariate legend clicks, and scrollytelling progression. |

---

## Proposed Changes

### 1. Backend: Space-Time Emerging Hotspot Service & Endpoints

#### `[NEW] backend/services/emergingHotspotService.js`
Implement space-time pattern mining over time-series heat and health data.

```javascript
/**
 * Calculates Getis-Ord Gi* spatiotemporal hotspot statistics across time quartiles.
 * Assigns ESRI-style categories: New, Persistent, Historical, Sporadic.
 */
export function calculateEmergingHotspots(geojsonFeatures, timeSeriesData) {
  // 1. Group observations into 4 temporal quartiles (Q1: 2018-2019, Q2: 2020-2021, Q3: 2022, Q4: 2023)
  // 2. Compute local mean & standard deviation per spatial cell across time steps
  // 3. Evaluate final-quartile z-score vs historical z-scores
  // 4. Return GeoJSON augmented with properties: { hotspot_category, z_score, trend_p_value }
}
```

#### `[MODIFY] backend/server.js`
Expose the space-time hotspot analysis endpoint.

```javascript
import { calculateEmergingHotspots } from "./services/emergingHotspotService.js";

app.get("/api/hotspots", (req, res) => {
  const dataset = req.query.dataset || "heat_tuberculosis";
  const hotspotsGeoJson = calculateEmergingHotspots(cachedRegions, timeSeriesDb[dataset]);
  res.json({ status: "available", data: hotspotsGeoJson });
});
```

---

### 2. Frontend State Management

#### `[NEW] frontend/src/state/usePacificVizState.ts`
Unified state store for brushing, Rose graph selection, bivariate legend filters, and scrollytelling progression.

```typescript
export type HotspotCategory = "new" | "persistent" | "historical" | "sporadic" | "none";
export type BivariateMode = "sequential" | "diverging-diverging" | "qualitative-sequential";

export interface PacificVizState {
  activeCategory: HotspotCategory | null;
  bivariateMode: BivariateMode;
  selectedPetalIndex: number | null;
  selectedLegendCell: [number, number] | null; // [row, col] in 3x3 matrix
  hoveredFeatureId: string | null;
  selectedFeatureIds: Set<string>;
  searchQuery: string;
  activeStoryStep: number;
  
  // Action dispatchers
  setHotspotCategory: (cat: HotspotCategory | null) => void;
  setBivariateMode: (mode: BivariateMode) => void;
  setSelectedPetal: (index: number | null) => void;
  setSelectedLegendCell: (cell: [number, number] | null) => void;
  setSearchQuery: (query: string) => void;
  setStoryStep: (step: number) => void;
}
```

---

### 3. Frontend Visualization Components

#### `[NEW] frontend/src/components/viz/NightingaleRoseChart.tsx`
Renders D3.js circular polar area chart (Nightingale Rose diagram) with angular petals corresponding to climate & health dimensions (Heat Days, TB Incidences, Vulnerable Population, Healthcare Access, Infrastructure Risk).

```tsx
import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import { usePacificVizState } from "../../state/usePacificVizState";

interface RosePetalData {
  axisName: string;
  value: number;
  maxValue: number;
  color: string;
  featureIds: string[];
}

export const NightingaleRoseChart: React.FC<{ data: RosePetalData[] }> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { selectedPetalIndex, setSelectedPetal, setSelectedFeatureIds } = usePacificVizState();

  useEffect(() => {
    if (!svgRef.current || !data.length) return;
    const width = 320, height = 320, radius = Math.min(width, height) / 2 - 20;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g").attr("transform", `translate(${width/2},${height/2})`);
    const angleScale = d3.scaleBand()
      .domain(data.map(d => d.axisName))
      .range([0, 2 * Math.PI]);

    const radiusScale = d3.scaleLinear()
      .domain([0, 100])
      .range([10, radius]);

    const arcGenerator = d3.arc<any>()
      .innerRadius(10)
      .outerRadius(d => radiusScale(d.value))
      .startAngle(d => angleScale(d.axisName)!)
      .endAngle(d => angleScale(d.axisName)! + angleScale.bandwidth())
      .padAngle(0.03)
      .padRadius(10);

    g.selectAll(".petal")
      .data(data)
      .enter()
      .append("path")
      .attr("class", "petal cursor-pointer transition-all duration-200")
      .attr("d", arcGenerator)
      .attr("fill", (d, i) => i === selectedPetalIndex ? "#f59e0b" : d.color)
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.5)
      .on("mouseenter", (event, d) => {
        setSelectedFeatureIds(new Set(d.featureIds));
      })
      .on("click", (event, d) => {
        const index = data.findIndex(p => p.axisName === d.axisName);
        setSelectedPetal(selectedPetalIndex === index ? null : index);
      });
  }, [data, selectedPetalIndex]);

  return <svg ref={svgRef} width={320} height={320} className="mx-auto overflow-visible" />;
};
```

#### `[NEW] frontend/src/components/viz/BivariateLegend.tsx`
Renders an interactive 3x3 matrix supporting Diverging-Diverging (center = norm baseline), Sequential, and Qualitative color schemes. Hovering/clicking a legend cell highlights matching features on Mapbox and charts.

```tsx
export const BivariateLegend: React.FC = () => {
  const { bivariateMode, selectedLegendCell, setSelectedLegendCell } = usePacificVizState();

  // 3x3 color matrix definitions per mode
  const matrixColors = useMemo(() => {
    if (bivariateMode === "diverging-diverging") {
      // Center (1,1) is neutral "norm", corners represent diverging extremes
      return [
        ["#008080", "#70a0a0", "#800080"],
        ["#a0d0d0", "#f3f4f6", "#d0a0d0"],
        ["#008000", "#a0d0a0", "#e65100"],
      ];
    }
    return [
      ["#e8e8e8", "#b0d5df", "#64abb0"],
      ["#e4acac", "#ad9dc5", "#567994"],
      ["#c85a5a", "#985356", "#2a5674"],
    ];
  }, [bivariateMode]);

  return (
    <div className="p-3 bg-white/90 backdrop-blur rounded-xl shadow-lg border border-neutral-200">
      <div className="text-xs font-bold text-neutral-800 mb-2">Bivariate Risk Matrix</div>
      <div className="grid grid-cols-3 gap-1 w-32 h-32">
        {matrixColors.flatMap((row, r) =>
          row.map((color, c) => (
            <button
              key={`${r}-${c}`}
              onClick={() => setSelectedLegendCell(
                selectedLegendCell?.[0] === r && selectedLegendCell?.[1] === c ? null : [r, c]
              )}
              className={`rounded transition-transform hover:scale-110 ${
                selectedLegendCell?.[0] === r && selectedLegendCell?.[1] === c ? "ring-2 ring-amber-500 scale-105" : ""
              }`}
              style={{ backgroundColor: color }}
            />
          ))
        )}
      </div>
    </div>
  );
};
```

#### `[NEW] frontend/src/components/viz/DrillDownBoxPlot.tsx`
Multi-level drill down displaying mean value, interquartile box plots, and population exposure uncertainty bounds when a feature is clicked.

---

### 4. Scrollytelling & Narrative Integration

#### `[NEW] frontend/src/components/story/ScrollytellingDeck.tsx`
Renders a modern, scrollytelling container featuring:
- **Minimalist Opening Splash Screen**: Direct search bar for country/territory filtering + 1-click story launcher.
- **Sequential Story Focus**: One attribute at a time (Chapter 1: Heat Emerging Hotspots $\rightarrow$ Chapter 2: TB & Health Risk Rose Graph $\rightarrow$ Chapter 3: Bivariate Population Risk $\rightarrow$ Chapter 4: Free Exploration).

---

## Verification Plan

### Automated Tests
Run backend unit test suite and frontend linting/e2e specs:
```bash
# 1. Run backend unit tests for space-time emerging hotspot calculation
cd backend && python3 -m pytest tests/test_h3_antimeridian_wrap.py -v

# 2. Run frontend TypeScript & ESLint validation
cd frontend && npm run lint && npx tsc --noEmit

# 3. Build Vite production bundle
cd frontend && npm run build

# 4. Run E2E Playwright test suite for Data Viz v2
cd frontend && npx playwright test e2e/pacific_viz_v2.spec.ts
```

### Manual Verification
1. **Splash Screen & Search Bar**: Open `http://localhost:5173/`, verify clean minimal start card, type "Fiji" into search bar, confirm country highlights and zooms.
2. **Nightingale Rose Chart**: Click a province, verify 5-petal circular Rose graph renders, hover a petal, and assert matching map features highlight.
3. **Emerging Hotspot Categorization**: Toggle Hotspot overlay, verify legend renders *New Hotspot*, *Persistent Hotspot*, and *Historical Hotspot* color badges.
4. **Interactive Bivariate Legend**: Switch to *Diverging-Diverging* legend mode, click center "norm" cell, and confirm map filters to average risk cells.
