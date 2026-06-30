import { useMemo, useState } from "react";

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(timestamp);
}

function getConversationPreview(chat) {
  if (!chat.messages || chat.messages.length === 0) {
    return "Empty conversation";
  }

  const latestMessage = [...chat.messages]
    .reverse()
    .find((message) => message.isLoading || message.content?.trim());

  if (!latestMessage) {
    return "Empty conversation";
  }

  if (latestMessage.isLoading) {
    return "Mapping tool intent...";
  }

  const prefix = latestMessage.role === "user" ? "You: " : "AI: ";

  return `${prefix}${latestMessage.content}`;
}

function getUpdatedTime(chat) {
  return chat.updatedAt ?? chat.createdAt ?? 0;
}

function Sidebar({
  conversations,
  activeConversationId,
  onNewChat,
  onClearAll,
  onSelectConversation,
  onDeleteConversation,
  onOpenSettings,
  onOpenHelp,
  className = "",
}) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredConversations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    const sortedConversations = [...conversations].sort(
      (a, b) => getUpdatedTime(b) - getUpdatedTime(a)
    );

    if (!query) {
      return sortedConversations;
    }

    return sortedConversations.filter((chat) => {
      const titleMatch = chat.title.toLowerCase().includes(query);

      const messageMatch = chat.messages.some((message) =>
        message.content?.toLowerCase().includes(query)
      );

      return titleMatch || messageMatch;
    });
  }, [conversations, searchTerm]);

  return (
    <aside
      className={`h-full min-h-0 w-[300px] shrink-0 rounded-[32px] bg-white border border-black/5 shadow-sm p-4 flex flex-col ${className}`}
    >
      <div className="flex items-center gap-3 px-2 py-2">
        <div className="h-11 w-11 rounded-2xl bg-neutral-950 text-white flex items-center justify-center text-lg font-semibold">
          C
        </div>

        <div>
          <h1 className="text-sm font-semibold text-neutral-900">
            Climate Risk Router
          </h1>
          <p className="text-xs text-neutral-400">
            PICT uncertainty chatbot
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <button
          onClick={onNewChat}
          className="w-full rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 transition flex items-center justify-between"
        >
          <span>New chat</span>
          <span className="text-lg leading-none">+</span>
        </button>

        <div className="relative">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search conversations"
            className="w-full rounded-2xl bg-neutral-50 px-4 py-3 pr-10 text-sm text-neutral-700 outline-none transition placeholder:text-neutral-400 hover:bg-neutral-100 focus:bg-white focus:ring-1 focus:ring-neutral-300"
          />

          {searchTerm ? (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 text-sm text-neutral-400 hover:text-neutral-800"
              aria-label="Clear search"
            >
              ×
            </button>
          ) : (
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400">
              ⌕
            </span>
          )}
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
          Your conversations
        </p>

        <button
          onClick={() => {
            setSearchTerm("");
            onClearAll();
          }}
          className="text-xs font-medium text-neutral-400 hover:text-neutral-800 transition"
        >
          Clear All
        </button>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-[24px] border border-dashed border-neutral-200 bg-neutral-50/50 p-2">
        {conversations.length === 0 ? (
          <div className="flex h-full items-center justify-center px-5 text-center">
            <div>
              <p className="text-sm font-medium text-neutral-500">
                No conversations yet
              </p>
              <p className="mt-1 text-xs leading-5 text-neutral-400">
                Start a new climate query and it will appear here.
              </p>
            </div>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex h-full items-center justify-center px-5 text-center">
            <div>
              <p className="text-sm font-medium text-neutral-500">
                No matching conversations
              </p>
              <p className="mt-1 text-xs leading-5 text-neutral-400">
                Try a different climate keyword.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredConversations.map((chat) => {
              const isActive = chat.id === activeConversationId;

              return (
                <div
                  key={chat.id}
                  className={`group w-full rounded-2xl px-3 py-3 text-left transition ${
                    isActive
                      ? "bg-neutral-950 text-white"
                      : "bg-white text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  <button
                    onClick={() => onSelectConversation(chat.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {chat.title}
                      </p>

                      <p
                        className={`shrink-0 text-[11px] ${
                          isActive ? "text-white/60" : "text-neutral-400"
                        }`}
                      >
                        {formatDate(getUpdatedTime(chat))}
                      </p>
                    </div>

                    <p
                      className={`mt-1 truncate text-xs ${
                        isActive ? "text-white/60" : "text-neutral-400"
                      }`}
                    >
                      {getConversationPreview(chat)}
                    </p>
                  </button>

                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteConversation(chat.id);
                    }}
                    className={`mt-2 rounded-xl px-2 py-1 text-xs transition ${
                      isActive
                        ? "text-white/50 hover:bg-white/10 hover:text-white"
                        : "text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                    }`}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-neutral-100 pt-4 space-y-2">
        <button
          onClick={onOpenSettings}
          className="w-full rounded-2xl px-4 py-3 text-left text-sm text-neutral-600 hover:bg-neutral-50 transition"
        >
          Settings
        </button>

        <button
          onClick={onOpenHelp}
          className="w-full rounded-2xl px-4 py-3 text-left text-sm text-neutral-600 hover:bg-neutral-50 transition"
        >
          Help & documentation
        </button>

        <div className="mt-3 flex items-center gap-3 rounded-[22px] bg-neutral-50 p-3">
          <div className="h-10 w-10 rounded-full bg-neutral-300 flex items-center justify-center text-sm font-semibold text-neutral-700">
            E
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-800">
              Efe
            </p>
            <p className="truncate text-xs text-neutral-400">
              Frontend prototype
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;