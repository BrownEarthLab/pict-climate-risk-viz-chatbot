/**
 * H3 Binning Pipeline
 *
 * Generates H3 hexagon grids over country/atoll polygons.
 *
 * - Resolution 4 by default (~1,200 km² cells)
 * - Falls back to Resolution 5 for atolls and small islands
 *   (Tuvalu, Nauru, Kiribati) whose bounding box is smaller
 *   than a single Resolution 4 cell.
 *
 * Each output feature is a polygon (H3 cell boundary) enriched
 * with the original region properties and the H3 index.
 */

import { polygonToCells, cellToBoundary, cellToLatLng, latLngToCell } from "h3-js";

// Resolutions
const RES_4 = 4;
const RES_5 = 5;

// Countries / atolls that require Resolution-5 fallback
const SMALL_ATOLL_ISO3 = new Set(["TUV", "NRU", "KIR"]);

/**
 * Compute the approximate area (sq km) of a bounding box.
 * Uses a simple spherical approximation.
 * @param {[number,number,number,number]} bboxArr - [minLng, minLat, maxLng, maxLat]
 * @returns {number} area in km²
 */
function bboxAreaKm2(bboxArr) {
  const [minLng, minLat, maxLng, maxLat] = bboxArr;
  const R = 6371; // Earth radius in km
  const latDiff = ((maxLat - minLat) * Math.PI) / 180;
  const lngDiff = ((maxLng - minLng) * Math.PI) / 180;
  const latMid = (((maxLat + minLat) / 2) * Math.PI) / 180;
  const width = R * lngDiff * Math.cos(latMid);
  const height = R * latDiff;
  return Math.abs(width * height);
}

/**
 * Compute the bounding box of a GeoJSON geometry (Polygon or MultiPolygon).
 * Returns [minLng, minLat, maxLng, maxLat].
 * @param {Object} geometry - GeoJSON geometry object
 * @returns {[number,number,number,number]}
 */
function computeBbox(geometry) {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const rings = [];
  if (geometry.type === "Polygon") {
    rings.push(...geometry.coordinates);
  } else if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates) {
      rings.push(...poly);
    }
  }

  for (const ring of rings) {
    for (const coord of ring) {
      const [lng, lat] = coord;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }

  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Determine which H3 resolution to use for a given feature.
 * Uses Res 4 by default, Res 5 if the feature's bbox is smaller than a Res 4 cell.
 * @param {Object} feature - GeoJSON feature
 * @returns {number} H3 resolution (4 or 5)
 */
function resolveResolution(feature) {
  const props = feature.properties || {};

  // For known small atolls, use Res 5 directly
  if (props.iso3 && SMALL_ATOLL_ISO3.has(props.iso3)) {
    return RES_5;
  }

  // Otherwise, check bounding box area
  try {
    const featureBbox = computeBbox(feature.geometry);
    const areaKm2 = bboxAreaKm2(featureBbox);

    // Approximate area of a Res 4 hexagon is ~1,200 km².
    // If the region's bounding box fits within a single Res 4 cell,
    // fall back to Res 5.
    if (areaKm2 < 1200) {
      return RES_5;
    }
  } catch {
    // If bounding box computation fails, default to Res 4
  }

  return RES_4;
}

/**
 * Calculate the centroid of a polygon's outer ring.
 * @param {Array<Array<[number, number]>>} polygonCoordinates
 * @returns {[number, number]} [lng, lat]
 */
function getPolygonCentroid(polygonCoordinates) {
  const outerRing = polygonCoordinates[0];
  if (!outerRing || outerRing.length === 0) return [0, 0];
  let sumLng = 0;
  let sumLat = 0;
  const count = outerRing.length;
  for (const coord of outerRing) {
    sumLng += coord[0];
    sumLat += coord[1];
  }
  return [sumLng / count, sumLat / count];
}

/**
 * Get all H3 cell indices that intersect a given polygon feature.
 * Uses h3-js v4+ polygonToCells which expects GeoJSON polygon coordinates.
 * @param {Object} feature - GeoJSON Polygon/MultiPolygon feature
 * @param {number} resolution - H3 resolution (4 or 5)
 * @returns {Array<string>} H3 cell indices
 */
function getCellIndices(feature, resolution) {
  const geometry = feature.geometry;

  // polygonToCells expects an array of polygon coordinates:
  // For Polygon: [ [lng,lat], ... ] (single ring)
  // For MultiPolygon: needs to be passed per-polygon
  let cellIds = [];

  if (geometry.type === "Polygon") {
    cellIds = polygonToCells(geometry.coordinates, resolution, true);
    if (cellIds.length === 0) {
      const centroid = getPolygonCentroid(geometry.coordinates);
      const cellId = latLngToCell(centroid[1], centroid[0], resolution);
      cellIds.push(cellId);
    }
  } else if (geometry.type === "MultiPolygon") {
    // polygonToCells expects a single polygon. For MultiPolygon,
    // we process each polygon separately and deduplicate.
    const seen = new Set();
    for (const polyCoords of geometry.coordinates) {
      const ids = polygonToCells(polyCoords, resolution, true);
      if (ids.length === 0) {
        const centroid = getPolygonCentroid(polyCoords);
        const cellId = latLngToCell(centroid[1], centroid[0], resolution);
        if (!seen.has(cellId)) {
          seen.add(cellId);
          cellIds.push(cellId);
        }
      } else {
        for (const id of ids) {
          if (!seen.has(id)) {
            seen.add(id);
            cellIds.push(id);
          }
        }
      }
    }
  }

  return cellIds;
}

/**
 * Convert an H3 cell index to a GeoJSON polygon feature.
 * @param {string} cellIndex - H3 cell index
 * @param {Object} properties - properties to attach
 * @returns {Object} GeoJSON Feature
 */
function cellIndexToFeature(cellIndex, properties) {
  const center = cellToLatLng(cellIndex);
  const centerLat = center[0];
  const centerLng = center[1];

  // cellToBoundary returns [lat, lng] pairs by default.
  // With formatAsGeoJson=true (2nd arg), it returns [lng, lat].
  const boundary = cellToBoundary(cellIndex, true);

  // Wrap longitudes crossing the antimeridian relative to the center longitude
  const wrappedBoundary = boundary.map(([lng, lat]) => {
    let wrappedLng = lng;
    if (lng - centerLng > 180) {
      wrappedLng -= 360;
    } else if (lng - centerLng < -180) {
      wrappedLng += 360;
    }
    return [wrappedLng, lat];
  });

  // Close the ring
  const coords = [...wrappedBoundary, wrappedBoundary[0]];

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [coords],
    },
    properties: {
      ...properties,
      h3_index: cellIndex,
      h3_resolution: parseInt(cellIndex.charAt(1), 10),
      h3_lat: centerLat,
      h3_lng: centerLng,
    },
  };
}

/**
 * Bin a GeoJSON FeatureCollection of region polygons into H3 cells.
 *
 * For each feature:
 *   - Determine resolution (Res 4 default, Res 5 for small atolls)
 *   - Polyfill the polygon to get covering H3 cell indices
 *   - Convert each H3 cell to a GeoJSON polygon
 *   - Assign the region's indicator value to each cell
 *
 * @param {Array<Object>} enrichedFeatures - joined features with indicator values
 * @returns {Object} FeatureCollection of H3 cell polygons
 */
function binFeaturesToH3(enrichedFeatures) {
  const h3Cells = [];

  for (const feature of enrichedFeatures) {
    let resolution = resolveResolution(feature);
    let cellIndices = getCellIndices(feature, resolution);

    // Some sub-atoll polygons (especially near the antimeridian) can yield
    // 0 cells at the chosen resolution even though the geometry is valid.
    // Step up the resolution until we get coverage (cap at Res 7).
    while (cellIndices.length === 0 && resolution < 7) {
      resolution += 1;
      cellIndices = getCellIndices(feature, resolution);
    }

    for (const cellIndex of cellIndices) {
      const cellFeature = cellIndexToFeature(cellIndex, {
        ...feature.properties,
        h3_resolution: resolution,
      });
      h3Cells.push(cellFeature);
    }
  }

  return {
    type: "FeatureCollection",
    features: h3Cells,
  };
}

export {
  resolveResolution,
  getCellIndices,
  cellIndexToFeature,
  binFeaturesToH3,
  SMALL_ATOLL_ISO3,
  RES_4,
  RES_5,
};
