# GIS Tools Catalog

> [!NOTE]
> This document is dynamically generated from the source-of-truth [gis_tools_catalog.json](./gis_tools_catalog.json).
> Run `python3 generate_markdown_catalog.py` to synchronize any updates.

## Quick Reference Table

| Function Name | Brief Description |
|---|---|
| [`sample_raster_at_points`](#sample-raster-at-points) | Samples the pixel values of a raster layer at the locations of a point vector layer and appends the values as a new column in the points attribute table. |
| [`zonal_statistics`](#zonal-statistics) | Computes summary statistics (such as mean, median, min, max, std_dev) of a raster layer within the polygons of a vector boundary layer. |
| [`clip_raster_by_mask`](#clip-raster-by-mask) | Clips (crops) a raster layer to the spatial extent of a vector polygon layer. |
| [`spatial_intersection`](#spatial-intersection) | Intersects two vector layers to create a new vector layer containing only the overlapping geometries and combined attributes. |
| [`buffer_geometry`](#buffer-geometry) | Generates a buffer polygon around geometries (points, lines, or polygons) at a specified distance. |
| [`raster_calculator`](#raster-calculator) | Performs pixel-wise mathematical operations on one or more raster layers using a formula expression. |
| [`reclassify_raster`](#reclassify-raster) | Reclassifies raster pixel values based on defined ranges or thresholds (e. |
| [`select_features_by_attribute`](#select-features-by-attribute) | Filters features from a vector layer based on an attribute query expression. |
| [`spatial_join`](#spatial-join) | Appends attributes from a join layer to a target layer based on their spatial relationship (intersects, contains, within). |
| [`raster_to_polygon`](#raster-to-polygon) | Vectorizes contiguous groups of raster pixels with identical values into polygon features. |

---

### `sample_raster_at_points`

**Description:** Samples the pixel values of a raster layer at the locations of a point vector layer and appends the values as a new column in the points attribute table.

**Inputs:**
| Argument | Type |
|---|---|
| `points_layer` | `vector_point` |
| `raster_layer` | `raster` |
| `output_column` | `string` |

**Outputs:**
- `points_layer_with_sampled_values`

**Use Cases:**
- *hospital heat exposure*
- *school flood exposure*
- *village rainfall risk*
- *well water contamination*

**Example User Questions:**
- "What is the projected wet-bulb temperature value at each hospital location in Tuvalu?"
- "Can we extract the coastal inundation depth for all water supply wells in Tarawa?"

---

### `zonal_statistics`

**Description:** Computes summary statistics (such as mean, median, min, max, std_dev) of a raster layer within the polygons of a vector boundary layer.

**Inputs:**
| Argument | Type |
|---|---|
| `raster_layer` | `raster` |
| `boundary_layer` | `vector_polygon` |
| `statistics` | `list_of_strings` |

**Outputs:**
- `boundary_layer_with_stats`

**Use Cases:**
- *average temperature per province*
- *mean heatwave days per island*
- *rainfall variability per catchment*
- *health risk index aggregation*

**Example User Questions:**
- "What is the average projected temperature increase for each island in Kiribati?"
- "How does the annual mean wet-bulb temperature vary across districts in Fiji?"

---

### `clip_raster_by_mask`

**Description:** Clips (crops) a raster layer to the spatial extent of a vector polygon layer.

**Inputs:**
| Argument | Type |
|---|---|
| `raster_layer` | `raster` |
| `mask_layer` | `vector_polygon` |

**Outputs:**
- `clipped_raster`

**Use Cases:**
- *crop global climate model to Kiribati EEZ*
- *subset regional wet-bulb raster to Tuvalu*
- *clip temperature grid to Viti Levu boundary*

**Example User Questions:**
- "Can we crop the global CMIP6 temperature projections to just show the Fiji island group?"
- "Filter the regional wet-bulb temperature map to Tuvalu's bounding box."

---

### `spatial_intersection`

**Description:** Intersects two vector layers to create a new vector layer containing only the overlapping geometries and combined attributes.

**Inputs:**
| Argument | Type |
|---|---|
| `layer_a` | `vector` |
| `layer_b` | `vector` |

**Outputs:**
- `intersected_layer`

**Use Cases:**
- *find exposed buildings in flood zones*
- *identify settlements inside heat risk polygons*
- *determine freshwater lenses intersecting coastal inundation zones*

**Example User Questions:**
- "Which health facilities in Kiribati are located in areas of high heat risk?"
- "How many settlements in Tuvalu overlap with the projected coastal flood hazard zones?"

---

### `buffer_geometry`

**Description:** Generates a buffer polygon around geometries (points, lines, or polygons) at a specified distance.

**Inputs:**
| Argument | Type |
|---|---|
| `input_layer` | `vector` |
| `distance` | `numeric` |
| `unit` | `string` |

**Outputs:**
- `buffered_layer`

**Use Cases:**
- *storm surge impact zones around deposit points*
- *distance from cyclone tracks*
- *proximity buffer around clinics*

**Example User Questions:**
- "Create a 5km storm surge warning zone around historic paleotempest sediment sites in Kiribati."
- "Show the areas within 10km of the projected cyclone trajectory."

---

### `raster_calculator`

**Description:** Performs pixel-wise mathematical operations on one or more raster layers using a formula expression.

**Inputs:**
| Argument | Type |
|---|---|
| `rasters` | `list_of_rasters` |
| `formula` | `string` |

**Outputs:**
- `output_raster`

**Use Cases:**
- *compute temperature difference (future minus baseline)*
- *calculate joint hazard index*
- *ratio of precipitation change*

**Example User Questions:**
- "What is the difference in annual heatwave days between the 2.0°C and 1.5°C global warming levels?"
- "Subtract the historical baseline temperature from the mid-century projection to map the temperature anomaly."

---

### `reclassify_raster`

**Description:** Reclassifies raster pixel values based on defined ranges or thresholds (e.g. converting continuous values to discrete risk classes).

**Inputs:**
| Argument | Type |
|---|---|
| `raster_layer` | `raster` |
| `thresholds` | `list_of_floats` |
| `classes` | `list_of_integers` |

**Outputs:**
- `classified_raster`

**Use Cases:**
- *define high heat risk zone (Tmax > 35°C)*
- *classify flood hazard levels (low/medium/high)*
- *map safety thresholds*

**Example User Questions:**
- "Classify areas where the annual maximum temperature exceeds 35°C as high risk."
- "Categorize the wet-bulb temperature raster into hazard zones based on safety limits."

---

### `select_features_by_attribute`

**Description:** Filters features from a vector layer based on an attribute query expression.

**Inputs:**
| Argument | Type |
|---|---|
| `vector_layer` | `vector` |
| `expression` | `string` |

**Outputs:**
- `selected_vector_layer`

**Use Cases:**
- *filter islands belonging to Kiribati*
- *select clinics with high catchment populations*
- *extract low-lying atolls*

**Example User Questions:**
- "Filter the administrative boundaries layer to only show the Gilbert Islands in Kiribati."
- "Select health clinics in Fiji that serve populations greater than 5,000."

---

### `spatial_join`

**Description:** Appends attributes from a join layer to a target layer based on their spatial relationship (intersects, contains, within).

**Inputs:**
| Argument | Type |
|---|---|
| `target_layer` | `vector` |
| `join_layer` | `vector` |
| `predicate` | `string` |

**Outputs:**
- `joined_vector_layer`

**Use Cases:**
- *count hospitals in heat risk zones*
- *aggregate population counts per atoll*
- *link water lenses to exposed settlements*

**Example User Questions:**
- "Count how many power substations and clinics are situated within the compound flood risk zone."
- "Assign the heatwave risk score of each atoll to the villages located on them."

---

### `raster_to_polygon`

**Description:** Vectorizes contiguous groups of raster pixels with identical values into polygon features.

**Inputs:**
| Argument | Type |
|---|---|
| `raster_layer` | `raster` |

**Outputs:**
- `vector_polygon_layer`

**Use Cases:**
- *convert high heat risk cells to polygons*
- *generate shapefiles of flood zones*
- *extract raster-based heatwave boundaries*

**Example User Questions:**
- "Convert the reclassified high-temperature pixels into polygon areas so we can run point overlays."
- "Generate boundary shapefiles for the areas projected to be inundated by sea level rise."

---
