import MapCanvas from "../map/MapCanvas";
import Sidebar from "../Sidebar";
import ConversationView from "../chat/ConversationView";
import { useSpatialQuery } from "../../hooks/useSpatialQuery";

interface Conversation {
  id: string;
  title: string;
  messages: {
    id: string;
    role: string;
    content: string;
    isLoading?: boolean;
  }[];
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
    queryMetadata,
    isQuerying,
    runSpatialQuery,
    runAssetHeatRiskQuery,
    fetchAdminAssets,
    clearSpatialQuery,
    setDrawnGeometry,
  } = useSpatialQuery();

  const isDrawMode = drawnGeometry !== null;
  const hasActiveChat =
    activeConversation !== null && activeConversation.messages.length > 0;

  const sidebarMode: "active-chat" | "history" | "hidden" = hasActiveChat
    ? "active-chat"
    : "history";

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-4">
      <main className="relative flex-1 overflow-hidden rounded-[28px] border border-black/5 bg-[#f8f6f1] shadow-sm">
        <MapCanvas
          onDrawGeometry={setDrawnGeometry}
          drawnGeometry={drawnGeometry}
          runSpatialQuery={runSpatialQuery}
          runAssetHeatRiskQuery={runAssetHeatRiskQuery}
          fetchAdminAssets={fetchAdminAssets}
          clearSpatialQuery={clearSpatialQuery}
          highlightedFeatures={highlightedFeatures}
          queryMetadata={queryMetadata}
          isDrawMode={isDrawMode}
          setIsDrawMode={() => {}}
          isQuerying={isQuerying}
        />
      </main>

      <aside
        className={`h-full min-h-0 shrink-0 transition-all duration-300 ${
          sidebarMode === "hidden"
            ? "w-0 overflow-hidden opacity-0"
            : "w-[320px] opacity-100"
        }`}
      >
        {sidebarMode === "active-chat" && activeConversation ? (
          <div className="flex h-full flex-col overflow-hidden rounded-[32px] border border-black/5 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
              <button
                onClick={onNewChat}
                className="text-sm font-medium text-neutral-500 hover:text-neutral-900"
              >
                ← Back
              </button>
              <h2 className="max-w-[200px] truncate text-sm font-semibold text-neutral-900">
                {activeConversation.title}
              </h2>
              <button
                onClick={() => onDeleteConversation(activeConversation.id)}
                className="text-xs text-neutral-400 hover:text-red-500"
              >
                Delete
              </button>
            </div>
            <div className="min-h-0 flex-1">
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