import { useEffect, useMemo, useRef, useState } from "react";
import { getApiUrl } from "../../config/api";
import {
  readPublishedAnalysisContext,
  subscribePublishedAnalysisContext,
  type PublishedAnalysisContext,
} from "./analysisContext";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface InterpretationChatProps {
  queryMetadata?: Record<string, unknown> | null;
  highlightedFeatures?: GeoJSON.Feature[] | null;
}

const CHAT_STORAGE_KEY = "pict-gemini-interpretation-chat-v1";

const STARTER_PROMPTS = [
  "What does this result mean?",
  "How should I interpret the uncertainty?",
  "What do the colors and opacity mean?",
  "What should I compare first?",
];

function loadMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-40) : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: ChatMessage[]): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      CHAT_STORAGE_KEY,
      JSON.stringify(messages.slice(-40)),
    );
  } catch {
    // Chat persistence is optional.
  }
}

function getContextLabel(context: Record<string, unknown> | null): string {
  const analysisType = String(context?.analysis_type || "");

  if (analysisType === "climate_tx90p") return "TX90p";
  if (analysisType === "tropical_cyclone_hazard") return "Cyclone hazard";
  if (analysisType === "asset_heat_risk") return "Asset heat";
  if (
    analysisType === "manual_heat_risk" ||
    analysisType === "population_heat_risk"
  ) {
    return "Daily heat";
  }

  return "No result selected";
}

function compactDailyHeatContext(
  queryMetadata: Record<string, unknown>,
  highlightedFeatures: GeoJSON.Feature[] | null | undefined,
): Record<string, unknown> {
  const summary =
    queryMetadata.summary && typeof queryMetadata.summary === "object"
      ? (queryMetadata.summary as Record<string, unknown>)
      : {};

  return {
    analysis_type: String(queryMetadata.analysis_type || "spatial_query"),
    visible_feature_count: highlightedFeatures?.length ?? 0,
    threshold_celsius: queryMetadata.threshold ?? null,
    comparison_operator: queryMetadata.comparison_operator ?? null,
    country_id: queryMetadata.country_id ?? null,
    country_name: queryMetadata.country_name ?? null,
    admin_level: queryMetadata.admin_level ?? null,
    admin_id: queryMetadata.admin_id ?? null,
    admin_name: queryMetadata.admin_name ?? null,
    h3_resolution: queryMetadata.h3_resolution ?? null,
    mean_exposure_probability:
      queryMetadata.mean_exposure_probability ??
      summary.mean_exposure_probability ??
      null,
    max_exposure_probability:
      queryMetadata.max_exposure_probability ??
      summary.max_exposure_probability ??
      null,
    mean_forecast_spread_celsius:
      queryMetadata.mean_forecast_spread ??
      summary.mean_forecast_spread ??
      null,
    max_forecast_spread_celsius:
      queryMetadata.max_forecast_spread ??
      summary.max_forecast_spread ??
      null,
    expected_exposed_population:
      queryMetadata.total_expected_exposed_population ??
      queryMetadata.expected_exposed_population ??
      null,
    total_population: queryMetadata.total_population ?? null,
    matched_asset: queryMetadata.matched_asset ?? null,
    summary: queryMetadata.summary ?? null,
    warnings: queryMetadata.warnings ?? [],
    provenance: queryMetadata.provenance ?? null,
    methodology: {
      forecast_source: "Open-Meteo rolling short-term hourly forecast",
      exposure_probability:
        "fraction of valid forecast hours at or above the selected threshold",
      forecast_spread:
        "P90 minus P10 across forecast-hour values; not inter-model uncertainty",
      population:
        "expected exposed population = population estimate x exposure probability",
    },
  };
}

const InterpretationChat = ({
  queryMetadata = null,
  highlightedFeatures = null,
}: InterpretationChatProps) => {
  const [publishedContext, setPublishedContext] =
    useState<PublishedAnalysisContext | null>(readPublishedAnalysisContext);
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(
    () => subscribePublishedAnalysisContext(setPublishedContext),
    [],
  );

  useEffect(() => {
    saveMessages(messages);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const activeContext = useMemo<Record<string, unknown> | null>(() => {
    const analysisType = String(queryMetadata?.analysis_type || "");
    const hasDailyHeatResult = [
      "manual_heat_risk",
      "asset_heat_risk",
      "population_heat_risk",
    ].includes(analysisType);

    if (hasDailyHeatResult && queryMetadata) {
      if (publishedContext) return publishedContext;
      return compactDailyHeatContext(queryMetadata, highlightedFeatures);
    }

    return publishedContext;
  }, [highlightedFeatures, publishedContext, queryMetadata]);

  const contextLabel = getContextLabel(activeContext);

  const clearChat = () => {
    setMessages([]);
    setError(null);
    try {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // Optional persistence only.
    }
  };

  const send = async (prompt?: string) => {
    const message = (prompt ?? input).trim();
    if (!message || isSending) return;

    const history = messages.map(({ role, content }) => ({ role, content }));
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsSending(true);
    setError(null);

    try {
      const response = await fetch(getApiUrl("/api/chat/interpret"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history,
          analysis_context: activeContext,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.details ||
            data?.error ||
            `Interpretation chat failed with HTTP ${response.status}`,
        );
      }

      const answer = String(data?.message || "").trim();
      if (!answer) {
        throw new Error("Gemini returned an empty response.");
      }

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: answer,
        },
      ]);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Could not reach the interpretation service.",
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside className="flex h-full min-h-0 w-[360px] shrink-0 flex-col overflow-hidden rounded-[28px] border border-[#BFD7ED] bg-white shadow-sm">
      <div className="border-b border-[#D8E8F5] bg-[#F3F7FA] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#174A73]">
              Interpret this analysis
            </div>
            <h2 className="mt-1 text-base font-black text-[#263746]">
              Ask about these results
            </h2>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              Gemini explains the displayed analysis. It does not recompute the
              scientific result.
            </p>
          </div>

          <button
            type="button"
            onClick={clearChat}
            className="rounded-lg border border-[#BFD7ED] bg-white px-2 py-1 text-[9px] font-bold text-[#174A73] hover:bg-[#E8F1F9]"
          >
            Clear
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg border border-[#BFD7ED] bg-white px-2.5 py-2">
          <div>
            <div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">
              Current context
            </div>
            <div className="text-[10px] font-black text-[#003F7B]">
              {contextLabel}
            </div>
          </div>
          <div className="rounded-full bg-[#E8F1F9] px-2 py-1 text-[8px] font-bold text-[#174A73]">
            Gemini 2.5 Flash
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div>
            <div className="rounded-xl border border-[#D8E8F5] bg-[#F8FBFD] p-3 text-[11px] leading-relaxed text-slate-600">
              Ask what a value means, how to read uncertainty, why a cell has a
              particular color/opacity, or what limitations apply to the active
              result.
            </div>

            <div className="mt-3 space-y-1.5">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void send(prompt)}
                  disabled={isSending}
                  className="w-full rounded-xl border border-[#D8E8F5] bg-white px-3 py-2 text-left text-[10px] font-semibold text-[#174A73] transition hover:bg-[#F3F7FA] disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2.5 text-[11px] leading-relaxed ${
                  message.role === "user"
                    ? "bg-[#174A73] text-white"
                    : "border border-[#D8E8F5] bg-[#F8FBFD] text-[#263746]"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}

          {isSending && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-[#D8E8F5] bg-[#F8FBFD] px-3 py-2.5 text-[10px] font-semibold text-slate-500">
                Interpreting…
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[10px] leading-relaxed text-amber-900">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[#D8E8F5] bg-white p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-[#BFD7ED] bg-[#F8FBFD] p-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder={
              activeContext
                ? "Ask how to interpret the current result…"
                : "Load an analysis, then ask how to interpret it…"
            }
            className="max-h-28 min-h-[48px] flex-1 resize-none bg-transparent px-1 py-1 text-[11px] text-[#263746] outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={isSending || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#174A73] text-sm font-black text-white transition hover:bg-[#003F7B] disabled:cursor-not-allowed disabled:bg-[#A9C9E3]"
            aria-label="Send interpretation question"
          >
            ↑
          </button>
        </div>

        <div className="mt-2 text-center text-[8px] leading-snug text-slate-400">
          Interpretive aid only · grounded in the active application result
        </div>
      </div>
    </aside>
  );
};

export default InterpretationChat;
