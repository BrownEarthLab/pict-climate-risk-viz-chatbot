/**
 * HTML tooltip fed by a TYPED interaction payload — labels, units, and source
 * attribution only. Raw feature property keys (extreme_heat_days_mean,
 * shapeISO, …) never reach the UI (spec: Tooltips Render Typed Fields, Never
 * Raw Properties).
 */
import type { ReactNode } from "react";

export interface TooltipField {
  label: string;
  value: string;
}

export interface TooltipPayload {
  title: string;
  fields: TooltipField[];
  source: string;
}

export interface TooltipProps {
  payload: TooltipPayload | null;
  x: number;
  y: number;
}

export function Tooltip({ payload, x, y }: TooltipProps) {
  if (!payload) return null;

  const style: React.CSSProperties = {
    position: "absolute",
    left: Math.min(x + 14, window.innerWidth - 260),
    top: Math.min(y + 14, window.innerHeight - 140),
    zIndex: 50,
    maxWidth: 240,
    pointerEvents: "none",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
    padding: "10px 12px",
    fontSize: 12,
    lineHeight: 1.5,
    color: "#111827",
  };

  return (
    <div style={style} role="tooltip" data-testid="viz-tooltip">
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{payload.title}</div>
      {payload.fields.map((field) => (
        <div key={field.label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "#6b7280" }}>{field.label}</span>
          <span style={{ fontWeight: 500 }}>{field.value}</span>
        </div>
      ))}
      <div style={{ marginTop: 6, color: "#9ca3af", fontSize: 10 }}>{payload.source}</div>
    </div>
  );
}

export function emptyTooltipNode(): ReactNode {
  return null;
}
