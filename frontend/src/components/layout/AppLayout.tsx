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
    <div className="flex h-[calc(100vh-2rem)] w-full">
      <main className="relative h-full w-full overflow-hidden rounded-[28px] border border-black/5 bg-[#f8f6f1] shadow-sm">
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
    </div>
  );
};

export default AppLayout;