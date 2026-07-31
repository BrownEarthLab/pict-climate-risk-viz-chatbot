/**
 * The bundle-guard sentinel (architecture.md Decision 3). This STRING LITERAL
 * is what `scripts/guard-bundle.mjs` greps the production bundle for — never
 * module paths or identifiers, because Vite 8 minifies with Oxc by default
 * and can mangle both while string literals survive. Every fixture module
 * references `FIXTURE_SENTINEL` from its exports, so bundling ANY fixture
 * necessarily carries this literal into the output, where the guard finds it.
 *
 * The sentinel value is deliberately grotesque: it must never collide with
 * anything a real dataset might legitimately contain.
 */
export const FIXTURE_SENTINEL = "fixture-data-workbench-sentinel-v1";
