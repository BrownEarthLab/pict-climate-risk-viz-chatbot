export const MAPBOX_DEFAULTS = {
  center: [170, -15] as [number, number],
  zoom: 4,
  style: "mapbox://styles/mapbox/streets-v11",
  projection: "globe" as const,
  fog: {
    color: "white",
    "high-color": "#add8e6",
    "horizon-blend": 0.2,
    "space-color": "#000000",
    "star-intensity": 0.15,
  },
};
