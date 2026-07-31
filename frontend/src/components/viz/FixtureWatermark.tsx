/**
 * The non-dismissible synthetic-data marker (architecture.md Decision 4;
 * spec "Fixture Renderings Are Visibly Marked"). Wraps any fixture view so
 * the marker sits INSIDE the visualization bounds — captured by a screenshot
 * of the chart, not by a page-level banner a crop removes.
 *
 * The marker is a passive overlay: `pointer-events-none`, no buttons, no
 * close control — there is structurally no way to dismiss it while the
 * visualization stays displayed. The label survives cropping on its own
 * (generic fixture labels are the load-bearing safeguard; the watermark is
 * the backup, not the reverse).
 *
 * Shared source (Decision 5): the application never renders fixture data, so
 * this wrapper is only ever imported by the workbench — but it is a
 * component, not workbench logic.
 */
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

export interface FixtureWatermarkProps {
  children: ReactNode;
  /** Marker text. Default keeps the marker unmistakable at a glance. */
  label?: string;
}

function addMarker(node: ReactNode, label: string): ReactNode {
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (typeof element.type === "function") {
    return cloneElement(element, { fixtureWatermark: label } as never);
  }
  if (element.props.children === undefined) return element;
  return cloneElement(
    element,
    undefined,
    Children.map(element.props.children, (child) => addMarker(child, label)),
  );
}

export function FixtureWatermark({ children, label = "SYNTHETIC FIXTURE DATA" }: FixtureWatermarkProps) {
  return (
    <div data-testid="fixture-view" className="relative">
      {Children.map(children, (child) => addMarker(child, label))}
    </div>
  );
}
