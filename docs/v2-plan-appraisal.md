# Appraisal: `docs/pacific-dataviz-v2-plan.md`

**Date:** 2026-07-30
**Verified against:** `feature/pacific-climate-viz-v2` @ `0edc66d`
**Verdict:** useful as a component sketch; **not safe to implement from.** Its file
targets describe a tree that does not exist on this branch, its verification commands do
not run, its hotspot statistic is not the statistic it claims to be, and its rose chart
reintroduces the exact defect that broke v1.

Companion to `docs/v2-direction-research.md`. Same discipline the v1 retrospective
recommends: verify a plan's claims against the working tree before acting on it.

---

## 1. Claims that are false on this branch

Every one of these was checked, not assumed.

| Plan claim | Verified reality |
| :--- | :--- |
| `backend/server.js` **lines 4900–4980** | File is **4876 lines**. The target range is past EOF. |
| "reuses existing … **CHVA facility datasets**" | **Not on this branch.** `grep -c "chva_facilities\|loadChvaFacilities" backend/server.js` → **0**. CHVA lives only on `feature/pacific-climate-brushing-viz`. |
| `MapCanvas.tsx` **lines 850–980, 2550–2680** | File is **2581 lines** here (2713 on the archived branch). The ranges describe the archived tree. |
| `ScrollytellingDeck.tsx` under `components/story/` | **`frontend/src/components/story/` does not exist** on this branch. |
| Integrate with existing brushing components | `LinkedRiskCharts.tsx` and `state/useBrushingState.ts` **do not exist here** — archived-branch only. |
| Verification: `npx tsc --noEmit` | **`typescript` is not installed.** This command fails. Identical to the false verification step in the v1 plan. |
| Verification: `pytest tests/test_h3_antimeridian_wrap.py` | **Does not exist on this branch** (archived branch only). |
| "Central **Zustand**/React state manager" | **Zustand is not a dependency** and appears nowhere in the project. |
| D3 rose chart / D3 imports | **D3 is not a dependency** on this branch. |

The pattern is the same as the v1 diagnostic plan: written against a *different* tree
(the archived brushing branch) and presented as describing this one.

## 2. Code that would not run as written

- **`/api/hotspots` references undefined variables.** `cachedRegions` and
  `timeSeriesDb` do not exist in `server.js`.
- **`setSelectedFeatureIds` is called in `NightingaleRoseChart` but never declared** in
  the `PacificVizState` interface — only `selectedFeatureIds` is.

## 3. The statistic is not the statistic it claims to be

The plan labels the service Getis-Ord $Gi^*$ and promises ESRI categories. The sketch:

> 2. Compute local mean & standard deviation per spatial cell **across time steps**
> 3. Evaluate final-quartile z-score vs historical z-scores

**This has no spatial component at all.** $Gi^*$ is by definition a spatially-weighted
statistic — each location is compared to its *neighbours* via a weights matrix. What is
described is a per-cell temporal z-score, which is a legitimate thing to compute but is
not $Gi^*$ and does not produce hot *spots* in any clustering sense.

There is also **no Mann-Kendall trend test**, which is what separates Intensifying from
Persistent from Diminishing. So the endpoint would emit category labels it has no basis
to assign. A reviewer who knows the method will catch this immediately, and the ESRI
citation makes the claim explicit rather than implicit.

Note also this does nothing to resolve the granularity problem in
`v2-direction-research.md` §2 — it sidesteps the spatial question by removing the
spatial statistic.

## 4. It reintroduces the v1 defect, verbatim

`NightingaleRoseChart.tsx` as written:

```tsx
useEffect(() => {
  svg.selectAll("*").remove();          // destroys everything
  ...
  .on("mouseenter", (event, d) => {
    setSelectedFeatureIds(new Set(d.featureIds));   // triggers a state update
  })
}, [data, selectedPetalIndex]);          // ← selectedPetalIndex in deps
```

Hovering a petal sets state → the effect re-runs → `selectAll("*").remove()` deletes the
petal currently under the cursor. Clicking does the same via `selectedPetalIndex`. This
is **Patch 4 from the v1 retrospective**, reproduced exactly — the bug that destroyed the
D3 brush mid-drag and cost a full debugging session.

The fix is already written down in `brushing-viz-retrospective.md` §2.5: split into a
**build** effect keyed on stable inputs and an **in-place restyle** effect keyed on
interaction state, which sets attributes and never removes nodes.

## 5. Encoding concerns

- **Rose chart radius scale.** `d3.scaleLinear()` maps value → radius, but a petal's
  *area* grows as r². A cell twice the value looks four times as large. Nightingale's
  original had this flaw; modern practice uses `scaleSqrt`. Given the notes' insistence
  that "everything should be intentional," this is worth deciding deliberately rather
  than inheriting.
- **Diverging-diverging palette is asserted, not derived.** The matrix mixes teal,
  purple, green and orange at the corners with intermediate cells that do not ramp
  coherently in lightness. The plan claims "colorblind-safe HSL palettes"; nothing in it
  validates that, and green/orange plus teal/purple are exactly the pairs that collapse
  under deuteranopia. Needs a real construction (two diverging ramps, blended) and a
  simulator check.

## 6. The integrity problem — flagging this hardest

> "…supplemented by a **synthetic time-series generator for tuberculosis/health
> indicator trends** across Pacific territories."

This proposes **fabricating health data for Pacific territories** and running it through
an analysis labelled with a real statistical method and real ESRI category names.

Do not do this. A map showing "persistent tuberculosis hotspot" over a real named
territory, computed from generated numbers, is indefensible in a lab meeting, in a
competition submission, and in a publication — regardless of a disclaimer, because the
visual claim travels further than the caveat. It is also the kind of thing that damages
credibility with the data providers (SPC / PDH) the project depends on.

If real TB data at usable granularity does not exist, that is a **finding that changes
the direction** — it is the open question in `v2-direction-research.md` §6.1 and §2 — not
a gap to fill with a generator. Synthetic data is legitimate only for *performance
testing* or *interaction development*, clearly labelled, never rendered as analysis.

## 7. What is genuinely worth keeping

The plan is stronger as decomposition than as engineering:

- **Component split** — `NightingaleRoseChart`, `BivariateLegend`, `DrillDownBoxPlot`,
  `ScrollytellingDeck` as separate components is a sensible boundary set.
- **`BivariateMode` union** — `"sequential" | "diverging-diverging" | "qualitative-sequential"`
  is a good API shape and maps cleanly onto the three modes in the notes.
- **Legend cell as a `<button>` driving selection state** — this is the
  "bivariate legend is brushed and linked to the chart itself" note, and the interaction
  shape is right even though the palette needs rebuilding.
- **Its two Open Questions are the right ones**, and Q2 (TB at H3 cells vs administrative
  level) is independently the same blocker identified in the research doc.
- **The aesthetic principles section** restates the lab notes accurately — minimal splash,
  no raw attribute slugs, intentional color.

---

## 8. Separate finding: the v1 backend work never reached this branch

Not from the plan, but surfaced while checking it. These differ between
`feature/pacific-climate-viz-v2` and the archived branch:

```
backend/server.js                            (CHVA route + loader)
backend/services/h3Binner.js                 (48 insertions / 34 deletions — land mask + refinements)
backend/tests/test_h3_antimeridian_wrap.py   (does not exist here)
data/layers/CHVADataSeperatedCoordinatesFile.csv
```

The basic antimeridian wrap **is** already present here — but the land-mask filter, the
CHVA layer, and the antimeridian regression test are not.

This is precisely the "data-pipeline work survives a pivot" category from the
retrospective (§2.8). Commit `5cd3c20` is the backend half of v1 and is worth
cherry-picking onto v2 on its own merits, independent of which direction is chosen.
Worth doing before building anything, since Direction B's encodings consume these layers.

---

## 9. Recommended use of the plan

Treat it as a **component inventory and a naming proposal**, not an implementation plan.
Specifically: take §7's decomposition, discard the line-range targets, rebuild the
palette, apply the split-effect rule to every D3 component, drop the synthetic data
generator, and either implement $Gi^*$ properly via `esda`/`libpysal` (or the student's
notebook) or drop the hotspot claim from the prototype and keep it for the iteration
after.
