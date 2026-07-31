/**
 * Chapter navigation. Advancing a chapter REPLACES the active encoding rather
 * than stacking a layer on top (spec: One Encoding Visible Per Chapter). The
 * preset (encoding + camera + legend mode) is applied ONLY in the parent's
 * chapter-change handler — never in an effect keyed on unstable deps
 * (v1 Patch 2 regression guard).
 */
import type { Chapter } from "./chapters";

export interface ChapterDeckProps {
  chapters: Chapter[];
  activeIndex: number;
  onSelectChapter: (index: number) => void;
}

export function ChapterDeck({ chapters, activeIndex, onSelectChapter }: ChapterDeckProps) {
  return (
    <nav aria-label="Chapters" className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        Chapters
      </div>
      <ol className="space-y-1">
        {chapters.map((chapter, index) => {
          const isActive = index === activeIndex;
          return (
            <li key={chapter.id}>
              <button
                type="button"
                onClick={() => onSelectChapter(index)}
                data-chapter-index={index}
                data-chapter-id={chapter.id}
                aria-current={isActive ? "step" : undefined}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                  isActive ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    isActive ? "bg-white/20 text-white" : "bg-neutral-200 text-neutral-600"
                  }`}
                >
                  {index + 1}
                </span>
                <span className="truncate">{chapter.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
