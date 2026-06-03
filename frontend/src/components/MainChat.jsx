import { useEffect, useRef } from "react";
import PromptCard from "./PromptCard";
import ChatInput from "./ChatInput";
import { starterPrompts } from "../data/starterPrompts";

function MainChat({ activeConversation, onPromptClick, onSendMessage }) {
  const messagesEndRef = useRef(null);

  const hasMessages =
    activeConversation && activeConversation.messages.length > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [
    activeConversation?.id,
    activeConversation?.messages.length,
    activeConversation?.messages.at(-1)?.content,
    activeConversation?.messages.at(-1)?.isLoading,
  ]);

  return (
    <main className="flex-1 rounded-[28px] bg-[#f8f6f1] border border-black/5 shadow-sm flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-8 py-10">
        {hasMessages ? (
          <div className="mx-auto w-full max-w-3xl space-y-4">
            {activeConversation.messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[75%] rounded-[24px] px-5 py-4 text-sm leading-6 shadow-sm ${
                    message.role === "user"
                      ? "bg-neutral-950 text-white"
                      : "bg-white text-neutral-700 border border-black/5"
                  }`}
                >
                  {message.isLoading ? <TypingDots /> : message.content}
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="flex min-h-full items-center justify-center">
            <div className="w-full max-w-5xl text-center">
              <p className="text-sm text-neutral-400 mb-3">
                Climate Risk Uncertainty Visualization
              </p>

              <h2 className="text-4xl font-semibold text-neutral-900">
                Good day! How may I assist you today?
              </h2>

              <p className="mt-4 text-neutral-500 max-w-2xl mx-auto">
                Ask about climate projections, uncertainty, trends, maps, or
                spatial risk patterns across Pacific Island Countries and
                Territories.
              </p>

              <div className="mt-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {starterPrompts.map((prompt) => (
                  <PromptCard
                    key={prompt.label}
                    label={prompt.label}
                    text={prompt.text}
                    onClick={() => onPromptClick(prompt.text)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <ChatInput onSendMessage={onSendMessage} />
    </main>
  );
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

export default MainChat;