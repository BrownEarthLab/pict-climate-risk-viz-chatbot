# Archived OpenSpec change: `pacific-climate-brushing-viz`

**Status: superseded, never shipped.** Direction redirected by the PI on 2026-07-30.

This is a **tracked mirror** of the OpenSpec change artifacts. The working copy lives at
`openspec/changes/archive/2026-07-30-pacific-climate-brushing-viz/`, but `openspec/` is
excluded from git via `.git/info/exclude`, so those files exist only on the machine that
authored them. This mirror is what actually survives a push or a fresh clone.

The delta spec here was **deliberately not synced** into `openspec/specs/`. The change's
headline capability — bi-directional brushing between Mapbox GL and D3 charts — was never
empirically verified as working, so promoting it into the main specs would record a
false claim.

## Read in this order

1. `../../brushing-viz-retrospective.md` — what is worth reusing in the next version, and
   what should not be carried forward. Start here.
2. `../../brushing-viz-debug-findings.md` — line-by-line technical record: the seven
   patches applied, the corrections to a stale upstream diagnosis, and the verification
   matrix (4 of 13 criteria empirically verified).
3. `proposal.md`, `architecture.md`, `tasks.md`, `tests.md`, `specs/` — the original
   change as written. Note the superseded banners in `proposal.md`.

## State at the moment of freezing

`storyteller_brushing_deck.spec.ts` + `test_dynamic_map_layers.spec.ts`: **13 passed, 3
failed, 1 skipped.** All three failures are the assertions that read map state rather
than the DOM. One known unresolved defect sits upstream of them: toggling a dynamic
layer updates React state and the legend, but the Mapbox layer stays at
`visibility: "none"`. See §2a of the retrospective.

## Code reference

The implementation is on branch `feature/pacific-climate-brushing-viz`, tagged
`v0-brushing-viz-archive`.
