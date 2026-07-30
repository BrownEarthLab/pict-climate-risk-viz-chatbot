# Reference Implementations — what the winning entries actually do

**Date:** 2026-07-30
**Method:** cloned and read `holtzy/pacific-challenge` (the 2024 Pacific Data Challenge
entry linked in the lab notes); fetched the React Graph Gallery circular-barplot
reference; checked licences via the GitHub API.
**Status:** research. Nothing pulled into the project yet.

---

## 1. Licensing — read this before copying anything

| Source | Licence | What we may do |
| :--- | :--- | :--- |
| `holtzy/pacific-challenge` | **No licence file** (verified via GitHub API) | Default all-rights-reserved. **Read for architecture, do not copy code.** |
| `holtzy/D3-graph-gallery` | **MIT** (852 stars) | Usable with attribution. |
| `react-graph-gallery.com` | Repo not found at `holtzy/react-graph-gallery`; site terms not stated | Treat as study-only. |

The distinction that matters: **patterns and architecture are not copyrightable; source
code is.** Everything below is worth adopting as an approach. None of it should be
pasted.

---

## 2. The finding that matters most

**The winning entry uses D3 for maths only. React renders every mark.**

Its dependencies are `d3-array`, `d3-scale`, `d3-shape`, `d3-geo` — and nothing else from
D3. A grep across the whole `src/` tree returns **zero** matches for `d3-selection`,
`d3-brush`, `selectAll`, or an SVG `useRef`.

Charts are pure React:

```
width/height arrive as props (from a useDimensions hook)
  → MARGIN constant, boundsWidth/boundsHeight computed
  → scales built in useMemo
  → marks produced by data.map(d => <rect …/>)
  → hover state is plain React state
```

**This architecture cannot have the bug that broke v1.** The v1 defect — an effect
calling `svg.selectAll("*").remove()` while listing interaction state in its dependency
array, so hovering deleted the element under the cursor — requires imperative D3 DOM
ownership to exist at all. Remove that, and the failure mode disappears rather than
having to be avoided.

The retrospective's §2.5 rule ("split the build effect from the restyle effect") is the
correct fix *if* you keep `d3-selection`. This is the better answer: don't keep it.

Note that the external v2 plan (`docs/pacific-dataviz-v2-plan.md`) reproduced exactly the
v1 bug in its rose chart. Adopting this architecture makes that class of review finding
impossible rather than merely caught.

### Consequence for our stack

Our v1 used `d3-selection` + `d3-brush` imperatively. If v2 goes React-renders-marks:

- We keep `d3-scale`, `d3-shape`, `d3-array` (and add `d3-geo` only if we want projected
  SVG maps).
- We **drop `d3-brush`** and implement brushing as a React-owned drag rect over the
  plotting area. More code than `d3.brush()`, but it lives in the same render tree as
  everything else and cannot be clobbered by a re-render.
- The Mapbox side is unaffected — `setFeatureState` is still the right GPU mechanism.
  This changes the *chart* half only.

---

## 3. Brushing and linking is simpler than we built it

Cross-chart highlighting in the winning entry is a React prop and an opacity ternary:

```
opacity={hovered || highlightedOccupation ? 0.1 : 1}
```

Selection is lifted to a parent and passed down (`setSelectedIsland`). There is no
selection store, no source attribution, no rAF throttle.

v1 built `useBrushingState` with `selectedIds`, `hoveredId`, `activeChapter`, and a
`source: "MAP" | "CHART" | "STORY"` field — and the retrospective records that **nothing
ever read `source`**, because the loop it guarded against never materialised. This entry
is evidence that the simple version is sufficient for chart↔chart linking.

Our case is genuinely harder in one respect: we have a Mapbox GL layer, and GPU
feature-state is a real requirement there. So the honest split is:

- **chart ↔ chart** — plain React state and props, as here.
- **chart ↔ map** — lifted state plus a `setFeatureState` effect, which is the one place
  the imperative escape hatch is warranted.

---

## 4. Tooltips are HTML, not SVG

A separate `Tooltip.tsx` plus a CSS module, positioned absolutely from a small state
object:

```ts
type InteractionData = { xPos: number; yPos: number; name: string };
```

The chart sets `hovered` to an `InteractionData | null`; the tooltip renders `null` when
that is null.

This is the mechanism behind the lab note *"tooltips are clean (no random attribute
names/slugs)"*. Because the tooltip is a React component receiving named fields rather
than a stringified property bag, formatting is a deliberate act. Our v1 tooltips were
built from Mapbox feature properties, which is exactly how raw slugs leak into the UI.

---

## 5. The rose chart: `scaleRadial`

The circular-barplot reference answers the encoding question raised in the plan
appraisal precisely:

- **angle** — `scaleBand().range([0, 2 * Math.PI])`
- **radius** — **`d3.scaleRadial()`**, not `scaleLinear`
- **paths** — `d3.arc()`

`scaleRadial` exists in `d3-scale` specifically for radial bars: it corrects for the fact
that a radial bar is wider at its outer edge than its inner edge, so equal value
differences produce equal *area* differences.

This supersedes both prior suggestions: the external plan's `scaleLinear` (which
exaggerates large values by roughly the square) and my own `scaleSqrt` note in
`v2-plan-appraisal.md` §5 — `scaleRadial` is the purpose-built scale and is the right
answer.

---

## 6. Other patterns worth taking

- **`useDimensions(ref)`** — ~25 lines, returns `{width, height}` from a container ref
  and re-measures on window resize. Charts then take width/height as props and are
  trivially responsive. We have no equivalent.
- **Per-chart directory**: `Barplot.tsx` + `Tooltip.tsx` + `tooltip.module.css`, with
  item subcomponents (`CircleItem`, `LineItem`, `DumbbellItem`) for individual marks.
- **`constant.tsx`** — shared design tokens. In their case just `AXIS_COLOR` and
  `AXIS_FONT_SIZE`. Trivially small, but it is the mechanism behind the lab note
  *"everything should be intentional"*: axis styling is a decision made once, not
  re-improvised per chart.
- **`@react-spring/web`** for animation rather than D3 transitions — consistent with
  React owning the DOM.
- **shadcn/ui + Tailwind** for chrome. We already use Tailwind.

---

## 7. Two structural choices they made that we probably should not copy

1. **No Mapbox.** Their map is a `BubbleMap` built on `d3-geo` projections and rendered
   as SVG. That is genuinely attractive for a scrollytelling piece — the map lives in the
   same React tree and the same coordinate system as the charts, which makes linking
   almost free. But we have substantial Mapbox investment (H3 binning, antimeridian
   wrapping, land masking, feature-state paint). **Flagging as an option, not a
   recommendation** — it would be a large pivot and it would strand real work.
2. **No backend.** Data is committed as static CSV/TSX, prepared offline by a
   `data_prep.R` script. Appropriate for a competition submission; wrong for us, since
   the SDMX pipeline and the geospatial tool registry are among our strongest assets.

---

## 8. What we could not verify

- **`hnuradhyaksa.github.io/post/pacific-dataviz-2025`** did not render — the fetch
  returned a single word ("Adhyaksa"), so it is a client-rendered SPA. No conclusions
  drawn about that entry.
- **NACIS** (`nacis.org`) is a conference site; it hosts a map competition gallery rather
  than source code. Useful for cartographic craft reference, not for implementation.

---

## 9. Suggested adoptions, if Direction B proceeds

Ordered by value, none of them requiring a decision about the analysis:

1. **React renders marks; D3 computes.** Adopt `d3-scale`, `d3-shape`, `d3-array`; do not
   reinstall `d3-selection` or `d3-brush`. This is the single highest-value change and it
   retires v1's worst bug class by construction.
2. **`useDimensions` hook** for responsive charts.
3. **HTML tooltips from typed interaction state**, never from raw feature properties.
4. **`scaleRadial`** for any radial encoding.
5. **A `constant.ts` of design tokens** before the first chart, not after the fifth.
6. **Keep `setFeatureState`** for the map — this is the one place imperative wins.

Clone kept at `<scratchpad>/pacific-challenge` for this session only; it is not vendored
into the repo and must not be.
