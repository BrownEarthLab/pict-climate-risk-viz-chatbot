# Archived OpenSpec change: `pacific-climate-brushing-viz`

**Status: superseded, never shipped.** Direction redirected by the PI on 2026-07-30.

This is a **mirror** of the OpenSpec change artifacts, tracked in the application repo.
The system of record is the spec vault at
`/home/node/global-sandbox/project-specs/pict-climate-risk-viz-chatbot`, synced by
`./sync-specs.sh push` / `pull` — `openspec/` is excluded from the application repo via
`.git/info/exclude` precisely because the vault versions it instead.

The mirror exists because **the vault has no configured git remote**, so it is a
single-disk copy. Once `feature/pacific-climate-brushing-viz` is pushed, this mirror is
the only copy of these artifacts that exists off this machine. Treat the vault as
authoritative for live changes and this directory as a frozen archival snapshot; the
change is superseded and should not be edited in either location.

Working copy in the vault:
`openspec/changes/archive/2026-07-30-pacific-climate-brushing-viz/`.

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
