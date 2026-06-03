import { useState } from "react";
import Sidebar from "../components/Sidebar";
import MainChat from "../components/MainChat";
import SettingsModal from "../components/SettingsModal";
import { useConversations } from "../state/useConversations";
import HelpModal from "../components/HelpModal";

function ChatPage() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const {
    conversations,
    activeConversation,
    activeConversationId,
    startNewConversation,
    startConversationFromPrompt,
    sendMessage,
    deleteConversation,
    clearConversations,
    selectConversation,
  } = useConversations();

  function handleSelectConversation(id) {
    selectConversation(id);
    setIsMobileSidebarOpen(false);
  }

  function handleNewChat() {
    startNewConversation();
    setIsMobileSidebarOpen(false);
  }

  return (
    <div className="min-h-screen bg-[#f4f1eb] p-3 sm:p-4">
      {/* Mobile top bar */}
      <div className="mb-3 flex items-center justify-between rounded-[24px] bg-white px-4 py-3 shadow-sm border border-black/5 lg:hidden">
        <button
          onClick={() => setIsMobileSidebarOpen(true)}
          className="rounded-2xl bg-neutral-950 px-4 py-2 text-sm font-medium text-white"
        >
          Menu
        </button>

        <div className="text-right">
          <p className="text-sm font-semibold text-neutral-900">
            Climate Risk A.I.
          </p>
          <p className="text-xs text-neutral-400">Frontend prototype</p>
        </div>
      </div>

      <div className="flex h-[calc(100vh-2rem)] gap-4">
        {/* Desktop sidebar */}
        <Sidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onNewChat={handleNewChat}
          onClearAll={clearConversations}
          onSelectConversation={handleSelectConversation}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenHelp={() => setIsHelpOpen(true)}
          onDeleteConversation={deleteConversation}
          className="hidden lg:flex"
        />

        <MainChat
          activeConversation={activeConversation}
          onPromptClick={startConversationFromPrompt}
          onSendMessage={sendMessage}
        />
      </div>

      {/* Mobile slide-over sidebar */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            onClick={() => setIsMobileSidebarOpen(false)}
            className="absolute inset-0 bg-black/25"
            aria-label="Close sidebar overlay"
          />

          <div className="absolute left-3 top-3 bottom-3">
            <Sidebar
              conversations={conversations}
              activeConversationId={activeConversationId}
              onNewChat={handleNewChat}
              onClearAll={clearConversations}
              onSelectConversation={handleSelectConversation}
              onOpenSettings={() => {
                setIsMobileSidebarOpen(false);
                setIsSettingsOpen(true);
              }}
              onOpenHelp={() => {
                setIsMobileSidebarOpen(false);
                setIsHelpOpen(true);
              }}
              onDeleteConversation={deleteConversation}
              className="h-full"
            />
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <SettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      
      {isHelpOpen && (
        <HelpModal onClose={() => setIsHelpOpen(false)} />
      )}
    </div>
  );
}

export default ChatPage;