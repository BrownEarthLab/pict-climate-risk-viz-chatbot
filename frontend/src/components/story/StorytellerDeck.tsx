import React from "react";
import type mapboxgl from "mapbox-gl";
import type { ClimateLayer } from "../../hooks/useMapbox";

export interface StoryChapter {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  provenance: string;
  mapPreset: {
    center: [number, number];
    zoom: number;
    pitch?: number;
    layer: ClimateLayer;
  };
}

export const STORY_CHAPTERS: StoryChapter[] = [
  {
    id: 1,
    title: "Chapter 1: The Heat Frontier",
    subtitle: "Extreme Heat Days in Fiji & Pacific SIDS",
    description:
      "As temperatures rise across Pacific Island countries, over 120,000 residents in Fiji's Western Division face severe apparent heat stress exceeding 35°C.",
    badge: "Extreme Heat (≥35°C)",
    provenance: "Source: Pacific Islands NetCDF CORDEX Projection & GeoBoundaries",
    mapPreset: {
      center: [177.55, -17.8],
      zoom: 8.5,
      pitch: 30,
      layer: "tas",
    },
  },
  {
    id: 2,
    title: "Chapter 2: Lifelines Under Threat",
    subtitle: "111 Healthcare Clinics & Subdivisional Hospitals",
    description:
      "111 community clinics and hospitals provide care across Fiji—yet 42% lie within 1 km of sea level rise exposure and coastal surge risks.",
    badge: "Fiji CHVA Facilities",
    provenance: "Source: Fiji CHVA Healthcare Assessment & Pacific Data Hub",
    mapPreset: {
      center: [178.44, -18.14],
      zoom: 9.5,
      pitch: 20,
      layer: "sea_level",
    },
  },
  {
    id: 3,
    title: "Chapter 3: Pacific Resilience",
    subtitle: "Renewable Power & Water Access Progress",
    description:
      "Tracking adaptation: SIDS across the Pacific Community (SPC) are expanding safely managed water access and renewable solar/hydro power generation.",
    badge: "Official PDH SDMX Indicators",
    provenance: "Source: Pacific Data Hub (PDH) SDMX API / Pacific Community (SPC)",
    mapPreset: {
      center: [179.0, -15.0],
      zoom: 4.2,
      pitch: 0,
      layer: "water_access",
    },
  },
  {
    id: 4,
    title: "Chapter 4: Open AI Explorer Mode",
    subtitle: "Interactive Brushing & Custom Queries",
    description:
      "Take full control. Drag selection boxes over distribution charts, filter H3 heat thresholds, or ask the AI assistant custom spatial questions.",
    badge: "Interactive Mode",
    provenance: "Source: Multi-Model Linked Explorer",
    mapPreset: {
      center: [178.0, -17.8],
      zoom: 6.5,
      pitch: 0,
      layer: null,
    },
  },
];

interface StorytellerDeckProps {
  currentChapter: number;
  onSelectChapter: (chapterId: number) => void;
  mapboxMap: mapboxgl.Map | null;
  setActiveLayer: (layer: ClimateLayer) => void;
}

export const StorytellerDeck: React.FC<StorytellerDeckProps> = ({
  currentChapter,
  onSelectChapter,
  mapboxMap,
  setActiveLayer,
}) => {
  const activeChapterData = STORY_CHAPTERS.find((c) => c.id === currentChapter) || STORY_CHAPTERS[0];

  const handleChapterClick = (chapterId: number) => {
    onSelectChapter(chapterId);
    const chapter = STORY_CHAPTERS.find((c) => c.id === chapterId);
    if (chapter && mapboxMap) {
      mapboxMap.flyTo({
        center: chapter.mapPreset.center,
        zoom: chapter.mapPreset.zoom,
        pitch: chapter.mapPreset.pitch || 0,
        duration: 2000,
        essential: true,
      });
      setActiveLayer(chapter.mapPreset.layer);
    }
  };

  return (
    <div className="bg-white/95 backdrop-blur-md rounded-2xl p-4 border border-black/5 shadow-sm mb-3">
      {/* Chapter Tabs Header */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2 border-b border-neutral-100">
        {STORY_CHAPTERS.map((ch) => {
          const isActive = ch.id === currentChapter;
          return (
            <button
              key={ch.id}
              onClick={() => handleChapterClick(ch.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer ${
                isActive
                  ? "bg-neutral-950 text-white shadow-sm"
                  : "bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
              }`}
            >
              Ch. {ch.id}: {ch.title.split(":")[1]?.trim() || ch.title}
            </button>
          );
        })}
      </div>

      {/* Active Narrative Content */}
      <div className="mt-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              {activeChapterData.badge}
            </span>
            <span className="text-xs text-neutral-500 font-mono">
              {currentChapter} / {STORY_CHAPTERS.length}
            </span>
          </div>
          <h3 className="text-sm font-bold text-neutral-900">{activeChapterData.subtitle}</h3>
          <p className="text-xs text-neutral-600 mt-1 max-w-2xl leading-relaxed">
            {activeChapterData.description}
          </p>
        </div>

        {/* Provenance Badge */}
        <div className="text-[10px] text-neutral-400 font-mono bg-neutral-50 px-2.5 py-1.5 rounded-lg border border-neutral-200/60 shrink-0">
          🛡️ {activeChapterData.provenance}
        </div>
      </div>
    </div>
  );
};
