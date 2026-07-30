# Draft Abstract: UTRA Symposium Submission

## Spatially-Aware Climate Risk Visualization & Decision-Support Chatbot for Pacific Island Countries and Territories

**Background:** Pacific Island Countries and Territories (PICTs) face extreme vulnerability to climate impacts, yet are underrepresented in global climate models. Coarse ensemble projections fail to resolve local dynamics like tropical cyclones and coastal processes, while multidimensional datasets remain inaccessible to local decision makers. There is a critical need for tools that make geospatial climate data more accessible and actionable for non-expert audiences.

**Methods:** We developed a spatially-aware conversational chatbot powered by 13 Python geospatial tools that enables users to query climate data through natural language. The system integrates live SDMX climate metrics, CMIP6 ensemble data, and healthcare facility records (111 CHVA sites) through an Express backend with dynamic H3 spatial binning. Users can draw custom spatial selections on an interactive map and receive real-time zonal statistics. A companion bivariate mapping interface was developed as a prototyping platform to test visualization features—including 3x3 tercile classification for climate risk and uncertainty—before integration into the chatbot's analytical toolkit.

**Results:** The chatbot interface provides guided starter prompts and warm minimalist design optimized for non-expert decision makers. Spatial query functionality enables custom polygon selections with live statistical feedback. The prototyping work on bivariate visualization yielded significant performance improvements: rendering overhead was reduced from 1,137 to 3 GPU traces, and dynamic H3 grid builds improved from 30 seconds to under 2 seconds. These optimizations were subsequently integrated into the chatbot's mapping components.

**Conclusions:** This project demonstrates an open AI framework for spatially-aware chatbots that deliver geographic insights and visualizations alongside descriptive text, making large geospatial datasets accessible through natural language interaction. Future work includes completing the end-to-end LLM function-calling loop, adding trend visualization charts, and integrating tropical cyclone hazard layers to enhance decision-support capabilities for PICT stakeholders.

---

**Word Count:** ~290 words

**Notes for submission:**
- Fits within 400-word maximum
- Structured as Background → Methods → Results → Conclusions
- Accessible language for cross-disciplinary audience
- Emphasizes chatbot as primary deliverable, Fiji map as prototyping platform
- Highlights both technical achievements and broader impact
- Notes future work to indicate project is in progress
