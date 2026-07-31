# Documentation index

Entry point for anyone — human or agent — picking up this project. Links only; the
content lives in the linked files.

## Active work

Change specs live in `openspec/` and **are tracked in this repository** — a clone has
them.

| Change | Where | What it is |
| :--- | :--- | :--- |
| `pacific-bivariate-scrollytelling-viz` | [`openspec/changes/pacific-bivariate-scrollytelling-viz/`](../openspec/changes/pacific-bivariate-scrollytelling-viz/) | The v2 deliverable — bivariate choropleth encoding, legend-as-brush, scrollytelling frame |
| `viz-component-workbench` | [`openspec/changes/viz-component-workbench/`](../openspec/changes/viz-component-workbench/) | Isolated component gallery with fixture containment, for components blocked on data |

Only the agent tool configs (`.claude/`, `.codex/`, `.agent/`, `.opencode/`, `AGENTS.md`)
stay outside the repo, in a local spec vault — see `AGENTS.md` if you have it.

Each carries `proposal.md` (why + scope), `architecture.md` (decisions, several of them
prohibitions), `specs/` (requirements + scenarios), `tests.md` (every criterion names its
command), `tasks.md` (ordered, TDD-first).

## Research and context — tracked, always available

Read in this order:

1. [v2-direction-research.md](v2-direction-research.md) — three directions costed; §2 the
   granularity constraint; **§3a the verified data inventory** (what exists, at what scale,
   with counts)
2. [brushing-viz-retrospective.md](brushing-viz-retrospective.md) — why v1 failed, which
   assets survive, seven guardrails carried into v2
3. [v2-reference-implementations.md](v2-reference-implementations.md) — architecture of the
   winning Pacific Data Challenge entry, and its licensing constraints
4. [v2-plan-appraisal.md](v2-plan-appraisal.md) — why an externally-supplied v2 plan was not
   implementable; useful as a worked example of verifying a plan against the tree
5. [brushing-viz-debug-findings.md](brushing-viz-debug-findings.md) — v1's line-by-line
   technical record
6. [v2-bivariate-viz-verification.md](v2-bivariate-viz-verification.md) — per-criterion
   verification record for the bivariate scrollytelling prototype (command + result for
   every `tests.md` item; unverified items marked unverified)
7. [v2-parallel-research.md](v2-parallel-research.md) — the not-blocking research that
   decides what comes next: TB data, the student's EHSA notebook, multi-year heat layers

## Archived

- [`openspec/changes/archive/2026-07-30-pacific-climate-brushing-viz/`](../openspec/changes/archive/2026-07-30-pacific-climate-brushing-viz/)
  — the superseded v1 change, frozen, with its own README. Code is on branch
  `feature/pacific-climate-brushing-viz`, tag `v0-brushing-viz-archive`.

## Data gaps

Tracked as GitHub issues; the visualization work proceeds against data already on disk
while these are open.

- [#12](https://github.com/BrownEarthLab/pict-climate-risk-viz-chatbot/issues/12) —
  tracking, with the gap-to-feature table and suggested order
- [#10](https://github.com/BrownEarthLab/pict-climate-risk-viz-chatbot/issues/10) —
  sub-national tuberculosis data · **highest priority, answerable in a day**
- [#9](https://github.com/BrownEarthLab/pict-climate-risk-viz-chatbot/issues/9) —
  multi-period heat layers, prerequisite for any space-time cube
- [#11](https://github.com/BrownEarthLab/pict-climate-risk-viz-chatbot/issues/11) —
  official PDH population indicators
- [#8](https://github.com/BrownEarthLab/pict-climate-risk-viz-chatbot/issues/8) —
  multi-model CMIP6 ensemble for genuine model uncertainty

Issues #4–#7 track v1 and are superseded — see the retrospective.

## Where things live in the tree

| Concern | Path |
| :--- | :--- |
| Python geospatial tools (13 schema'd tools, 19 pytest files) | `backend/tools/geospatial/`, `backend/tools/schemas/`, `backend/tests/` |
| H3 binning, antimeridian wrap | `backend/services/h3Binner.js` |
| Pacific Data Hub SDMX client + cache | `backend/services/sdmxApiClient.js`, `data/cache/sdmx/` |
| NEX-GDDP-CMIP6 processing | `backend/scripts/build_climate_layer_from_nex.py` |
| Climate layer registry, catalogs | `data/layers/climate_layer_registry.json`, `data/catalog/` |
| Reference geometries | `data/reference/` |
| Map component and Mapbox hook | `frontend/src/components/map/`, `frontend/src/hooks/useMapbox.ts` |
| Browser tests (Playwright starts both servers) | `frontend/e2e/`, `frontend/playwright.config.ts` |

## Project-level docs

- [../README.md](../README.md) — product goal and current workflow
- [project-notes.md](project-notes.md), [next-steps.md](next-steps.md),
  [frontend-plan.md](frontend-plan.md)
- [manual-risk-api-contract.md](manual-risk-api-contract.md),
  [spatial-query-implementation-plan.md](spatial-query-implementation-plan.md)
- [presentation-script-and-cheat-sheet.md](presentation-script-and-cheat-sheet.md) — ⚠️ its
  slide-4 description of the bivariate Y-axis as "model uncertainty (α)" is **wrong**; that
  axis is inter-annual variability. See issue #8.
