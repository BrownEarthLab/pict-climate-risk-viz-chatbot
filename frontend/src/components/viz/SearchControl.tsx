/**
 * Search control that brushes a named region (country or province) across both
 * views. An unmatched search reports "no match" WITHOUT disturbing the existing
 * selection (spec: Search Brushes A Named Region).
 */
import { useMemo, useState } from "react";

export interface SearchableFeature {
  id: string;
  properties: Record<string, unknown>;
}

export interface SearchControlProps {
  features: SearchableFeature[];
  nameKey: string;
  onSelectIds: (ids: string[]) => void;
  onNoMatch: (query: string) => void;
  onFocusFeatures?: (ids: string[]) => void;
}

export function SearchControl({
  features,
  nameKey,
  onSelectIds,
  onNoMatch,
  onFocusFeatures,
}: SearchControlProps) {
  const [query, setQuery] = useState("");
  const [noMatch, setNoMatch] = useState<string | null>(null);

  const names = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const feature of features) {
      const name = String(feature.properties?.[nameKey] ?? "");
      if (name && !seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
    return out.sort();
  }, [features, nameKey]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const term = query.trim().toLowerCase();
    if (!term) return;

    const matches = features.filter((f) =>
      String(f.properties?.[nameKey] ?? "").toLowerCase().includes(term)
    );

    if (matches.length === 0) {
      setNoMatch(query.trim());
      onNoMatch(query.trim());
      return;
    }

    setNoMatch(null);
    onSelectIds(matches.map((f) => f.id));
    onFocusFeatures?.(matches.map((f) => f.id));
  };

  return (
    <form onSubmit={handleSubmit} className="relative" role="search" aria-label="Search regions">
      <input
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          if (noMatch) setNoMatch(null);
        }}
        placeholder="Search a country or province…"
        aria-label="Search a region"
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        list="bivariate-region-list"
      />
      <datalist id="bivariate-region-list">
        {names.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {noMatch && (
        <div
          data-testid="search-no-match"
          className="mt-1 text-xs text-amber-700"
          role="status"
        >
          No region matches "{noMatch}" — your selection is unchanged.
        </div>
      )}
    </form>
  );
}
