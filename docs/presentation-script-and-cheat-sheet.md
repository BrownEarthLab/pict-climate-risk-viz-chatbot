# UTRA Project Demo: Presentation Script & Quick-Reference Note Cards

**Presenter:** Gregory Lazatin  
**Project:** Spatially-Aware Climate Risk Visualization & Decision-Support Chatbot for PICTs  
**Research Lab:** Brown University — EarthLab (UTRA Summer 2026)  
**Collaborator:** Yigit Efe Enhos  

---

## Slide 1: Title Slide & Abstract

### ⚡ Quick-at-a-Glance Cheat Sheet
- **Title**: Spatially-Aware Climate Risk Visualization & Decision-Support Chatbot for PICTs.
- **Roles**: 
  - **Gregory Lazatin** (Presenter): Data Exploration Engine, Bivariate Mapping (`earthlab-fiji-map`), SDMX Backend Pipeline, Server Services.
  - **Yigit Efe Enhos** (Partner): Conversational UI/UX Design, Guided Prompting, 13-Tool Analytical Geospatial Python Engine.
- **Abstract Core**: Bridge global climate model uncertainty and non-expert decision-making in vulnerable Pacific Island Countries and Territories (PICTs).

### 🎙️ Spoken Presentation Script
> *"Good morning everyone. Welcome to our demo presentation on our UTRA summer research project with Brown EarthLab: **Spatially-Aware Climate Risk Visualization and Decision-Support Chatbot for Pacific Island Countries and Territories (PICTs)**.*
> 
> *I am Gregory Lazatin, and alongside my research partner Yigit Efe Enhos, we set out to address a critical gap in climate risk communication. As outlined in our research proposal, Pacific Island nations sit on the frontline of global climate change, yet are poorly represented in standard global climate models. Our goal was to build a dual-interface platform—combining a 2D bivariate uncertainty map with a natural language AI chatbot—to enable non-expert decision makers to visualize projection uncertainty and explore regional climate data."*

---

## Slide 2: Problem Statement: PICT Climate Risk & Uncertainty

### ⚡ Quick-at-a-Glance Cheat Sheet
- **Frontline Vulnerability**: PICTs face ocean warming, extreme heat stress, and sea-level rise due to low-lying geography.
- **GCM Resolution Gap**: CMIP6 models at 100–250 km resolution underrepresent small islands.
- **Fine-Scale Drivers Missing**: Tropical Cyclones (TCs) and storm surges are not directly simulated in coarse GCMs, producing high model output uncertainty.
- **Decision Gap**: Policymakers receive raw model averages without spatial confidence bounds; NetCDF format requires expert GIS skills.

### 🎙️ Spoken Presentation Script
> *"To understand why this project is urgent, consider the frontline vulnerability of Pacific Small Island States. As documented in Chapter 15 of the IPCC WGII Sixth Assessment Report, PICTs face severe threats from sea level rise, marine heatwaves, and coastal inundation.*
> 
> *However, standard CMIP6 Global Climate Models operate at coarse spatial resolutions—typically 100 to 250 kilometers per grid cell. At this resolution, small island landmasses are often blurred into open ocean grid cells. Crucially, major drivers of regional climate risk—such as Tropical Cyclones and localized storm surge—are not directly simulated in these global models, creating significant output uncertainty.*
> 
> *When non-expert decision makers receive simple model averages without spatial variance metrics or confidence bounds, effective climate adaptation planning breaks down. Our project directly bridges this gap by turning complex raster and NetCDF datasets into intuitive, uncertainty-aware visualizations."*

---

## Slide 3: Dual Platform System Architecture & Motivation

### ⚡ Quick-at-a-Glance Cheat Sheet
- **Module 1 (`earthlab-fiji-map`)**: Targeted side-project experimental sandbox. Used to prototype, benchmark, and optimize 2D bivariate choropleth matrices, GPU trace rendering, H3 hexagonal binning, and CHVA spatial joins.
- **Module 2 (`pict-climate-risk-viz-chatbot`)**: Primary main application and decision-support system. Integrates conversational UI, MapCanvas drawer, SDMX live backend services, and 13 Python tools.

### 🎙️ Spoken Presentation Script
> *"To achieve these goals, we structured our development across two complementary software repositories.*
> 
> *Module 1, `earthlab-fiji-map`, served as our isolated experimental sandbox. We created this side project specifically to benchmark high-performance spatial algorithms, test 3×3 bivariate choropleth matrices, optimize GPU trace rendering, and pre-aggregate H3 spatial grids without risking the stability of our main application.*
> 
> *Once these spatial exploration algorithms were validated, we integrated them into Module 2, `pict-climate-risk-viz-chatbot`—our primary end-user decision-support system. This main platform combines a minimalist conversational interface, live SDMX data services, an interactive MapCanvas, and 13 analytical Python tool wrappers."*

---

## Slide 4: Fiji Interactive Bivariate Map (`earthlab-fiji-map`)

### ⚡ Quick-at-a-Glance Cheat Sheet
- **3×3 Bivariate Matrix**: Maps Projected Temperature Mean ($\text{raster\_mean}$) against Model Uncertainty ($\alpha$) on a 9-class color grid.
- **Uncertainty Metric ($\alpha$)**: Currently implemented as a mock inverse-temperature placeholder ($1 - \text{normalized\_mean}$) on top of the bivariate choropleth function, to be updated with real multi-model ensemble spatial variance ($\text{raster\_std}$).
- **GPU Optimization**: Reduced Mapbox trace overhead from **1,137 separate traces down to 3 static GPU layers** ($\text{Choroplethmapbox}$), completely resolving browser interaction freezes.

### 🎙️ Spoken Presentation Script
> *"Slide 4 shows a screenshot of our 2D Bivariate Map dashboard, `fiji_optimized.html`. A bivariate choropleth map allows us to display two distinct variables simultaneously on a single map using a 3×3 color matrix. In our matrix, the X-axis represents projected temperature mean ($\text{raster\_mean}$), while the Y-axis represents model uncertainty ($\alpha$).*
> 
> *Currently, $\alpha$ is implemented as an initial mock inverse-temperature placeholder ($1 - \text{normalized\_mean}$) building on top of our bivariate choropleth function, which will be updated with true multi-model ensemble spatial variance ($\text{raster\_std}$).*
> 
> *A major engineering highlight here was GPU trace rendering optimization: initial prototypes rendered 1,137 individual Mapbox polygon traces, causing severe browser interaction freezes. By refactoring the pipeline into 3 static GPU layers using Plotly's `Choroplethmapbox`, we achieved smooth 60fps interaction."*

---

## Slide 5: CHVA Healthcare Facility Layer & H3 Polyfilling

### ⚡ Quick-at-a-Glance Cheat Sheet
- **CHVA Facility Dataset**: Fiji Climate Change & Health Vulnerability Assessment dataset tracking 111 mapped healthcare facilities (Hospitals, Health Centres, Nursing Stations).
- **Spatial Join Overlay (`gpd.sjoin`)**: Vector GIS spatial join mapping GPS point coordinates directly to administrative subdivision polygons.
- **Dynamic H3 Polyfilling**: Uber H3 discrete global grid system (Resolutions 5, 6, 7) with geometric caching cutting build times from **~30s down to <2s**.

### 🎙️ Spoken Presentation Script
> *"On Slide 5, we integrated real-world infrastructure vulnerability data from the Fiji Climate Change & Health Vulnerability Assessment (CHVA). This dataset maps 111 healthcare infrastructure locations across Fiji—categorized into Hospitals, Health Centres, and Nursing Stations.*
> 
> *Using GeoPandas spatial joins (`gpd.sjoin`), we overlaid these point coordinates directly onto administrative subdivision polygons to calculate per-division healthcare facility exposure.*
> 
> *Furthermore, we implemented Uber's H3 discrete global grid system at resolutions 5, 6, and 7. To ensure responsive user performance, we engineered a geometric caching layer in `data/cache/` that reduced H3 pipeline build times from nearly 30 seconds down to under 2 seconds, truncating GeoJSON coordinates to 6 decimal places for rapid network transfer."*

---

## Slide 6: Spatially-Aware Decision Chatbot Interface

### ⚡ Quick-at-a-Glance Cheat Sheet
- **Minimalist Aesthetic**: Clean, warm environmental design system using soft sand tones tailored for decision makers reviewing environmental reports.
- **Guided Starter Prompt Cards**: Onboards non-expert users with high-yield starter queries ("Explore climate risk in Fiji", "Explain projection uncertainty").

### 🎙️ Spoken Presentation Script
> *"Slide 6 presents the primary interface of our decision-support application running on port 5173. The interface was built with a clean, warm minimalist design system using soft sand tones, specifically tailored for non-expert policymakers reviewing climate risk documents.*
> 
> *To lower the entry barrier for decision makers who may not be familiar with GIS software, the interface features guided starter prompt cards. Non-expert users don't need to construct complex spatial queries from scratch; clicking prompts like 'Explore climate risk in Fiji' or 'Explain projection uncertainty' automatically initiates backend analytical workflows."*

---

## Slide 7: Spatial Query Engine & SDMX Live Backend

### ⚡ Quick-at-a-Glance Cheat Sheet
- **Interactive MapCanvas**: Mapbox GL JS canvas featuring thin boundary outlines, tooltips, and polygon drawing controls (`DrawControls.tsx`) for real-time zonal statistics.
- **SDMX Protocol**: Ingests live regional Pacific metrics directly from Pacific Data Hub (PDH) SDMX endpoints via `sdmxApiClient.js`.
- **H3 Binner**: Aggregates live SDMX climate metrics into H3 spatial cells on the fly via `h3Binner.js`.

### 🎙️ Spoken Presentation Script
> *"On Slide 7, you see our MapCanvas spatial query drawer in action, showing a user selecting a Tikina administrative boundary in Fiji. Users can draw custom bounding boxes or select administrative polygons to compute real-time zonal statistics over custom geographic areas.*
> 
> *On the backend, we integrated live SDMX data ingestion via `sdmxApiClient.js`. SDMX—standing for Statistical Data and Metadata eXchange—is an international ISO standard used by organizations like the Pacific Data Hub (PDH) and SPC to publish regional Pacific statistics. Our server fetches live indicator datasets—such as sea-level anomalies and power generation metrics—directly from PDH APIs and uses `h3Binner.js` to aggregate them into H3 spatial cells dynamically."*

---

## Slide 8: 13-Tool Python Analytical Geospatial Engine

### ⚡ Quick-at-a-Glance Cheat Sheet
- **13 Python Modules**: Organized into 5 categories: Spatial & Region, Climate Extremes, Aggregation & Trends, Risk & Vulnerability, and Scenarios.
- **LLM Function Calling**: Programmatically maps natural language prompts directly to backend Python spatial operations.

### 🎙️ Spoken Presentation Script
> *"Slide 8 details our 13-tool analytical geospatial Python engine. Rather than relying on simple text generation, our architecture equips the LLM with 13 formal Python tool wrappers organized across five functional categories:*
> 1. *Spatial & Region Lookups (`spatial.py`, `region.py`)*
> 2. *Climate Extremes & Anomaly Calculation (`climate.py`, `extremes.py`, `thresholds.py`)*
> 3. *Spatial/Temporal Aggregation & Variance (`statistics.py`, `aggregation.py`, `temporal.py`)*
> 4. *Infrastructure Exposure & Vulnerability Ranking (`exposure.py`, `assets.py`, `ranking.py`, `asset_ranking.py`)*
> 5. *Multi-Scenario & SSP Pathway Analysis (`scenario.py`)*
> 
> *When a user asks a query like 'Find vulnerable hospitals in Fiji exposed to extreme heat under SSP5-8.5', the LLM invokes function calls that execute these Python GIS scripts programmatically, returning precise data."*

---

## Slide 9: Remaining Features to Complete Proposal

### ⚡ Quick-at-a-Glance Cheat Sheet
- **Priority 0 (Immediate)**: Complete full LLM JSON Schema execution loop & embed Recharts interactive time-series trend lines.
- **Priority 1 (High Impact)**: Ingest true CMIP6 multi-model ensemble spatial variance ($\text{raster\_std}$) & Tropical Cyclone hazard layers.
- **Priority 2 & 3 (Enhancements)**: Build RAG vector storage system for layer metadata and tool schemas, add Brushing & Linking, optimize CDN dashboard (<500 KB), and render React Flow execution graphs.

### 🎙️ Spoken Presentation Script
> *"While we have delivered working prototypes for both modules, Slide 9 outlines our clear roadmap to fully complete every milestone of the original research proposal.*
> 
> *Priority 0 involves connecting our Express server to Python tool scripts via formal JSON Schemas and embedding interactive Recharts time-series graphs for warming pathways.*
> 
> *Priority 1 will replace our mock uncertainty placeholder with true CMIP6 multi-model ensemble spatial variance ($\text{raster\_std}$) and ingest historical Tropical Cyclone track hazard layers.*
> 
> *Finally, Priorities 2 and 3 will introduce a RAG vector storage system for spatial layer metadata and tool schemas, add Brushing & Linking for dynamic cross-filtering between maps and charts, and optimize dashboard bundles for low-bandwidth island networks."*

---

## Slide 10: Summary & Acknowledgments

### ⚡ Quick-at-a-Glance Cheat Sheet
- **Key Deliverables**: 2D Bivariate Uncertainty Map (3 GPU layers), AI Chatbot UI with 13 Python tools, live SDMX ingestion, H3 binning, and Playwright E2E test suites.
- **Conclusion**: Open for questions, comments, and discussion.

### 🎙️ Spoken Presentation Script
> *"In summary, over the course of this UTRA summer project, we successfully created an interactive 2D Bivariate Uncertainty Map for Fiji with 3 GPU layer optimization, built a warm minimalist AI chatbot UI backed by 13 analytical Python geospatial tools, integrated live SDMX Pacific data ingestion with H3 spatial binning, and established comprehensive Playwright E2E test suites across both codebases.*
> 
> *We want to thank Brown EarthLab and our research mentors for their guidance. Thank you for your time, and we are now happy to answer any questions or open the floor for discussion!"*
