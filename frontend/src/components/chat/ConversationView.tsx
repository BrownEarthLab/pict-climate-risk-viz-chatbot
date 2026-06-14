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

const ConversationView = ({ messages, onSendMessage }: ConversationViewProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, messages.at(-1)?.content, messages.at(-1)?.isLoading]);

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
                {message.isLoading ? <TypingDots /> : message.content}
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
