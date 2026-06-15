import { useEffect } from "react";
import MapCanvas from "../map/MapCanvas";
import MainChat from "../MainChat";
import Sidebar from "../Sidebar";
import ConversationView from "../chat/ConversationView";
import { useSpatialQuery } from "../../hooks/useSpatialQuery";

interface Conversation {
  id: string;
  title: string;
  messages: { id: string; role: string; content: string; isLoading?: boolean }[];
  createdAt: number;
  updatedAt: number;
}

interface AppLayoutProps {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  activeConversationId: string | null;
  onNewChat: () => void;
  onPromptClick: (text: string) => void;
  onSendMessage: (text: string) => void;
  onDeleteConversation: (id: string) => void;
  onClearAll: () => void;
  onSelectConversation: (id: string) => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}

const AppLayout = ({
  conversations,
  activeConversation,
  activeConversationId,
  onNewChat,
  onPromptClick,
  onSendMessage,
  onDeleteConversation,
  onClearAll,
  onSelectConversation,
  onOpenSettings,
  onOpenHelp,
}: AppLayoutProps) => {
  const {
    drawnGeometry,
    highlightedFeatures,
    isQuerying,
    runSpatialQuery,
    clearSpatialQuery,
    setDrawnGeometry,
  } = useSpatialQuery();

  useEffect(() => {
    if (drawnGeometry) {
      runSpatialQuery(drawnGeometry, { "Backend Received Polygon": true });
    } else {
      clearSpatialQuery();
    }
  }, [drawnGeometry]);

  const isDrawMode = drawnGeometry !== null;
  const hasActiveChat = activeConversation !== null && activeConversation.messages.length > 0;

  const sidebarMode = isDrawMode ? "hidden" : hasActiveChat ? "active-chat" : "history";

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-4">
      <main className="relative flex-1 rounded-[28px] overflow-hidden border border-black/5 shadow-sm bg-[#f8f6f1]">
        <MapCanvas
          onDrawGeometry={setDrawnGeometry}
          highlightedFeatures={highlightedFeatures}
          isDrawMode={isDrawMode}
          setIsDrawMode={() => {}}
        />

        {!hasActiveChat && !isDrawMode && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px] pointer-events-none">
            <div className="pointer-events-auto">
              <MainChat onPromptClick={onPromptClick} onSendMessage={onSendMessage} />
            </div>
          </div>
        )}
      </main>

      <aside
        className={`h-full min-h-0 shrink-0 transition-all duration-300 ${
          sidebarMode === "hidden" ? "w-0 overflow-hidden opacity-0" : "w-[320px] opacity-100"
        }`}
      >
        {sidebarMode === "active-chat" && activeConversation ? (
          <div className="h-full rounded-[32px] bg-white border border-black/5 shadow-sm flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
              <button
                onClick={onNewChat}
                className="text-sm font-medium text-neutral-500 hover:text-neutral-900"
              >
                ← Back
              </button>
              <h2 className="text-sm font-semibold text-neutral-900 truncate max-w-[200px]">
                {activeConversation.title}
              </h2>
              <button
                onClick={() => onDeleteConversation(activeConversation.id)}
                className="text-xs text-neutral-400 hover:text-red-500"
              >
                Delete
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <ConversationView
                messages={activeConversation.messages}
                onSendMessage={onSendMessage}
              />
            </div>
          </div>
        ) : (
          <Sidebar
            conversations={conversations}
            activeConversationId={activeConversationId}
            onNewChat={onNewChat}
            onClearAll={onClearAll}
            onSelectConversation={onSelectConversation}
            onOpenSettings={onOpenSettings}
            onOpenHelp={onOpenHelp}
            onDeleteConversation={onDeleteConversation}
            className="h-full"
          />
        )}
      </aside>
    </div>
  );
};

export default AppLayout;
