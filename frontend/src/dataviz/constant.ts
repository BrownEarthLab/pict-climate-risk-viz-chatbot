/**
 * Shared design tokens for the dataviz components.
 * Single source of truth so the charts, legend, and tooltip stay visually
 * consistent — created before the first chart, not after the fifth.
 */
export const DATAVIZ_TOKENS = {
  // Typography
  fontFamily:
    "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  axisLabelSize: 11,
  tickLabelSize: 10,
  panelTitleSize: 12,

  // Colors
  axisColor: "#9ca3af",
  gridColor: "#e5e7eb",
  selectedMarkColor: "#111827",
  unselectedMarkColor: "#d1d5db",
  panelBackground: "#ffffff",
  panelBorder: "#e5e7eb",

  // Spacing
  panelPadding: 16,
  markGap: 2,

  // Legend
  legendCellSize: 34,
  legendCellGap: 2,

  // Geometry
  chartMargin: { top: 12, right: 16, bottom: 28, left: 40 },
} as const;
