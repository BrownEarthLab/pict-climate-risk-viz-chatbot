import { useState } from "react";

function ChatInput({ onSendMessage }) {
  const [input, setInput] = useState("");

  function handleSend() {
    const trimmed = input.trim();

    if (!trimmed) return;

    onSendMessage(trimmed);
    setInput("");
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-black/5 px-6 py-5">
      <div className="mx-auto flex max-w-4xl items-end gap-3 rounded-[28px] bg-white p-3 shadow-sm border border-black/5">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Ask about climate risk, uncertainty, trends, or maps..."
          className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-3 text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
        />

        <button
          onClick={handleSend}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white transition hover:bg-neutral-800"
          aria-label="Send message"
        >
          ↑
        </button>
      </div>

      <p className="mt-3 text-center text-xs text-neutral-400">
        Prototype mode: responses are placeholders until the climate backend is connected.
      </p>
    </div>
  );
}

export default ChatInput;