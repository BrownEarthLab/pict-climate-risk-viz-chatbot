# Project Roadmap & Next Steps

This document outlines the proposed roadmap and next steps for the **Climate Risk & Uncertainty Visualization Chatbot** based on current requirements, system design, and feedback from the PI.

---

## LLM Tooling & Analytical API Wrapper
*Define and improve the backend toolset so that the LLM can programmatically trigger spatial operations.*

- [ ] **Standardize Tool API Interfaces (JSON Schema)**
  - Define exact parameters, inputs, and outputs for all analytical tools (e.g., `select_features_by_attribute`, `buffer_geometry`, `zonal_statistics`).
- [ ] **Implement Backend Spatial Logic**
  - Connect the tools to real spatial computation (e.g., via PostGIS/GDAL on the Express backend, or wrapping Python-based processing scripts).
- [ ] **Build Tool Execution wrappers**
  - Create functions that map LLM function-calling JSON payloads directly to backend endpoints, executing workflows sequentially.
- [ ] **Incorporate Uncertainty Quantification**
  - Standardize how spatial coverage warnings (e.g., grid resolution limits, date-line edge cases) and dataset confidence limits are returned by each tool.

---

## Standardizing Layers & Visualization Engine
*Enable seamless upload, registry, and advanced visual representations of climate risk datasets.*

- [ ] **Define a Unified Layer Metadata Standard**
  - Create a JSON format for dataset headers describing coordinate range, resolution (H3 index level), physical units (Celsius, percentage), source model, and uncertainty metrics.
- [ ] **Build a Layer Upload & Processing Pipeline**
  - Automate the conversion of raw NetCDF/Shapefiles into standard H3-binned GeoJSON layers (similar to `dataset-explorer` scripts).
- [ ] **Create a Dynamic Layer Registry**
  - Maintain a database table or backend register tracking loaded layers so the LLM knows what datasets are currently available.
- [ ] **Enhance Mapbox Visualizations & Legends**
  - Add features like 3D hexagon extrusions based on risk values, customized point-of-interest tooltips (e.g., hospitals, critical infrastructure), and dynamic legend generation.
- [ ] **Integrate Statistical Charts**
  - Embed dynamic charts (e.g., using Recharts or D3.js) inside the sidebar to show probability distributions, ensemble trends over time (historical vs. 2050/2100), and variance bands.

---

## Node-Based Visual Workflow Programmer
*Transition the workflow preview from a read-only list into an interactive, node-based programming canvas.*

- [ ] **Integrate a Flow Rendering Framework**
  - Install a library like React Flow or a lightweight alternative compatible with the frontend stack.
- [ ] **Generate Visual Node Graphs from LLM JSON**
  - Translate the LLM's sequential JSON workflows into a nodes-and-edges diagram representing the data pipeline (inputs ➔ tools ➔ outputs).
- [ ] **Implement Interactive Parameter Adjustments**
  - Allow users to click on nodes to edit parameters (e.g., slide to adjust buffer distance, select drop-down variables) or manually reroute connections (edges).
- [ ] **Enable Visual Execution Tracking**
  - Animate nodes/edges during computation (e.g., glowing edges for data transfer, green success checkmarks, red error states).

---

## RAG (Retrieval-Augmented Generation) Architecture
*Ground the chatbot’s natural language responses and tool recommendations in verified scientific climate documentation.*

- [ ] **Select RAG Infrastructure**
  - Choose a vector storage solution (e.g., `pgvector` extension inside PostgreSQL, or a lightweight embedded engine like Chromadb).
- [ ] **Chunk & Index Climate Literature**
  - Ingest IPCC regional reports, Pacific climate briefings, and dataset metadata documents.
- [ ] **Design Spatial-Semantic Retrieval Strategy**
  - Implement a retrieval pipeline that query-filters documents based on geography (e.g., query for "Fiji hospital heat risk" prioritizes documents tagged with Fiji or Melanesia).
- [ ] **Craft Safety Prompts & Uncertainty Callouts**
  - Program the LLM to explicitly report uncertainty bounds, model caveats, and dataset exclusions alongside any retrieved answer.
