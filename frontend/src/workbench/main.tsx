/**
 * Workbench entry (architecture.md Decision 1): a second Vite entry served in
 * dev and absent from the production build. Renders the component gallery —
 * the three components whose real data is still blocked on issues #9/#10/#11,
 * fed by fixture datasets. The workbench imports only shared component source
 * and fixtures; it never touches the application's map, state, or narrative.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./workbench.css";
import { WorkbenchApp } from "./WorkbenchApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WorkbenchApp />
  </StrictMode>,
);
