import PromptCard from "./PromptCard";
import ChatInput from "./ChatInput";
import { starterPrompts } from "../data/starterPrompts";

function MainChat({ onPromptClick, onSendMessage }) {
  return (
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

        <div className="mt-8 mx-auto max-w-2xl">
          <ChatInput onSendMessage={onSendMessage} />
        </div>
      </div>
    </div>
  );
}

export default MainChat;
