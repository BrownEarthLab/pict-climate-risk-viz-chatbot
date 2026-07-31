/**
 * Minimal splash view (spec: Opening Splash Screen Is Minimal): a title, a
 * one-sentence framing, the search control, and a single entry point into the
 * narrative. No layer control surface on first paint.
 */
import { SearchControl } from "../viz/SearchControl";

export interface SplashViewProps {
  onEnter: () => void;
  searchFeatures: { id: string; properties: Record<string, unknown> }[];
  nameKey: string;
  onSelectIds: (ids: string[]) => void;
  onNoMatch: (query: string) => void;
}
export function SplashView({
  onEnter,
  searchFeatures,
  nameKey,
  onSelectIds,
  onNoMatch,
}: SplashViewProps) {
  return (
    <div
      data-testid="splash-view"
      className="absolute inset-0 z-40 flex items-center justify-center bg-[#f8f6f1]/95"
    >
      <div className="w-full max-w-md px-6 text-center">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
          Pacific climate risk atlas
        </div>
        <h1 className="mt-3 text-3xl font-bold leading-tight text-neutral-900">
          Two stresses, one map
        </h1>
        <p className="mt-4 text-sm leading-6 text-neutral-600">
          Pacific communities are exposed to heat, sea level, and unequal
          access to the basics. Each chapter pairs two indicators on one map —
          the legend is your brush.
        </p>

        <div className="mt-6 text-left">
          <SearchControl
            features={searchFeatures}
            nameKey={nameKey}
            onSelectIds={onSelectIds}
            onNoMatch={onNoMatch}
          />
        </div>

        <button
          type="button"
          onClick={onEnter}
          data-testid="enter-narrative"
          className="mt-6 w-full rounded-lg bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-700"
        >
          Enter the narrative →
        </button>
      </div>
    </div>
  );
}
