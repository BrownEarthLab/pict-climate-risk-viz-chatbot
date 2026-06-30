import { useEffect, useRef } from "react";
import ChatInput from "../ChatInput";

interface Message {
  id: string;
  role: string;
  content: string;
  isLoading?: boolean;
}

interface ConversationViewProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  onViewWorkflowOnMap?: (workflow: any) => void;
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400 [animation-delay:120ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400 [animation-delay:240ms]" />
    </div>
  );
}

const ConversationView = ({ messages, onSendMessage, onViewWorkflowOnMap }: ConversationViewProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, messages.at(-1)?.content, messages.at(-1)?.isLoading]);

  const renderMessageContent = (content: string) => {
    const marker = "```json-workflow";
    if (!content.includes(marker)) {
      return content;
    }

    const parts = content.split(marker);
    const textPrefix = parts[0];
    const rest = parts[1] || "";
    const endMarkerIndex = rest.indexOf("```");

    if (endMarkerIndex === -1) {
      return content;
    }

    const jsonStr = rest.substring(0, endMarkerIndex).trim();
    const textSuffix = rest.substring(endMarkerIndex + 3);

    try {
      const workflowData = JSON.parse(jsonStr);
      return (
        <div className="space-y-3">
          {textPrefix && <p className="whitespace-pre-line">{textPrefix.trim()}</p>}
          
          {/* Callout box for workflow proposing redirect to map */}
          <div className="p-3 border border-blue-100 rounded-xl bg-blue-50/30 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="shrink-0 whitespace-nowrap rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-bold text-blue-700 uppercase tracking-wider">
                GIS Pipeline Proposed
              </span>
            </div>
            <h4 className="text-xs font-bold text-neutral-900 mt-1">{workflowData.title}</h4>
            <p className="text-[11px] text-neutral-500 leading-normal">{workflowData.description}</p>
            <button
              onClick={() => onViewWorkflowOnMap?.(workflowData)}
              className="mt-1 w-full rounded-lg bg-neutral-950 hover:bg-neutral-800 text-white font-semibold py-1.5 text-xs transition cursor-pointer text-center"
            >
              Inspect & Run on Map
            </button>
          </div>

          {textSuffix && <p className="whitespace-pre-line">{textSuffix.trim()}</p>}
        </div>
      );
    } catch (err) {
      console.error("Failed to parse workflow JSON:", err);
      return content;
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                  message.role === "user"
                    ? "bg-neutral-950 text-white"
                    : "bg-white text-neutral-700 border border-black/5"
                }`}
              >
                {message.isLoading ? <TypingDots /> : renderMessageContent(message.content)}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="border-t border-black/5 px-3 py-3">
        <ChatInput onSendMessage={onSendMessage} />
      </div>
    </div>
  );
};

export default ConversationView;
