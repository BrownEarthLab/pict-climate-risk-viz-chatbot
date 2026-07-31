/**
 * The provenance contract (architecture.md Decision 2): every dataset
 * consumed by a visualization component SHALL carry `provenance: "real" |
 * "fixture"`, required, with no default. A default of `"real"` would mean
 * forgetting the field silently produces the dangerous state; a default of
 * `"fixture"` would mean forgetting it silently blocks production. Requiring
 * it forces the author to state which it is, and makes the omission a loud
 * error.
 *
 * `assertRealProvenance` is the APPLICATION-ENTRY runtime half of the
 * containment contract (Decision 3): fixture data arriving through any path
 * the build cannot see — a dev server, a paste, a future API — is refused
 * here. The workbench never calls it.
 */

export type Provenance = "real" | "fixture";

export interface ProvenancedData {
  provenance?: unknown;
}

/**
 * Throw unless `data` declares `provenance: "real"`. Names the offending
 * dataset so a failure is attributable (spec scenario "Missing provenance is
 * rejected": rejected with an error naming the dataset).
 */
export function assertRealProvenance(data: unknown, datasetId: string): void {
  if (data === null || data === undefined) {
    throw new Error(
      `Dataset "${datasetId}" supplied no data at all — and no provenance field. ` +
        `Every dataset must declare provenance: "real" | "fixture".`,
    );
  }
  const provenance = (data as Record<string, unknown>).provenance;
  if (provenance === undefined || provenance === null) {
    throw new Error(
      `Dataset "${datasetId}" is missing the required "provenance" field ("real" | "fixture"). ` +
        `Refusing to render (architecture.md Decision 2).`,
    );
  }
  if (provenance !== "real") {
    throw new Error(
      `Dataset "${datasetId}" is flagged provenance "${String(provenance)}". The application ` +
        `entry refuses to render fixture data; it belongs to the workbench (architecture.md ` +
        `Decision 3).`,
    );
  }
}
