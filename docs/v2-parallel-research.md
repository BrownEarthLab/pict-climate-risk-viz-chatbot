# Parallel Research Notes — v2 Directions (2026-08-01)

Companion to `docs/v2-bivariate-viz-verification.md`. These questions are NOT
blocking for the bivariate prototype (tasks.md §10); they decide what comes next.

## 10.1 Tuberculosis data below national level?

**Finding: no tuberculosis data exists in this repository.** A grep across
`backend/` (Python + JS) and `frontend/src` for tuberculosis/TB identifiers
returns nothing. The repository's on-disk inventory is limited to the climate
layers, the SDMX cache (sea level, power generation, safe water access), and the
reference geometries.

The deciding question therefore stands open and still requires an external
source (SPC Pacific Data Hub, or the lab's PDH contacts): does a Fiji
sub-national (or tikina-level) TB time series exist, and at what time depth?

- If it is **one value per country per year**, every Fiji tikina shares the same
  national value and "click a province → see TB change" has nothing to drive —
  the interaction dies before it renders. Direction A is not viable in that case.
- If it is **sub-national with a usable time depth**, Direction A becomes viable
  as the container the bivariate frame already provides (an EHSA layer is just
  another encoding inside it).

This is a one-day task for a human with PDH access. It is not answerable from
the repo.

## 10.2 The student's emerging-hotspot notebook

**Finding: the notebook is not in this repository.** What Direction A needs as
input, from `docs/v2-direction-research.md` §2 and `architecture.md` Decision 6:

- a **space-time cube** — the per-cell, per-year heat values (see 10.3); the
  current processed heat layer is a single-period aggregate, so no cube exists yet;
- a **spatial weights matrix** — defensible only within Fiji at tikina/cell level,
  not across ~20 ocean-separated PICT countries;
- **Gi\* per time bin plus Mann-Kendall** to separate Intensifying / Persistent /
  Diminishing — via `esda`/`libpysal` or a port of the student's notebook. Note
  the full ESRI taxonomy is 16 categories, not the three in the lab notes.

The notebook itself must come from the student; the repo can host a port once it
is in hand.

## 10.3 Multi-year heat layers — scope

**Finding: the raw per-year data is on disk.** `data/climate/raw/nex_gddp_cmip6/`
holds 40 `tasmax_ACCESS-CM2_ssp245_<year>_window{0,1}.nc` files covering
2041–2060 (20 years × 2 windows). `backend/scripts/build_climate_layer_from_nex.py`
already reads these, groups by `(lat, lon)`, and aggregates
`extreme_heat_days_mean/_min/_max` and `mean_tasmax_c_mean` across the period
(`--start-year` / `--end-year` / `--threshold-c` CLI, verified in the script
around lines 288–296).

**Scope for a space-time cube (the prerequisite for any EHSA):**

1. Extend the aggregation to emit **per-year layers** (one FeatureCollection per
   year, or a `year` property per cell) instead of only the period aggregate.
2. Register the per-year layers in `data/layers/climate_layer_registry.json`
   alongside the existing entry.
3. Optional: emit 5-year bins (the catalog already defines yearly / 5-year /
   decade windows in `data/catalog/`).
4. Then an EHSA layer becomes another encoding inside the bivariate frame — no
   frame rework needed.

Estimated as a self-contained follow-up change; the frame is deliberately the
container this slots into (architecture.md Decision 6, "Path back in").
