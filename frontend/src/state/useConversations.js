import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "pict-climate-risk-conversations";

function loadConversations() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function sortConversationsByRecent(chats) {
  return [...chats].sort((a, b) => {
    const bTime = b.updatedAt ?? b.createdAt ?? 0;
    const aTime = a.updatedAt ?? a.createdAt ?? 0;
    return bTime - aTime;
  });
}

function createConversation({ title = "New climate query", messages = [] } = {}) {
  const now = Date.now();

  return {
    id: `chat-${now}`,
    title,
    messages,
    createdAt: now,
    updatedAt: now,
  };
}

function createUserMessage(content) {
  return {
    id: `msg-${Date.now()}`,
    role: "user",
    content,
    createdAt: Date.now(),
  };
}

function createLoadingAssistantMessage() {
  return {
    id: `msg-${Date.now() + 1}`,
    role: "assistant",
    content: "",
    isLoading: true,
    createdAt: Date.now() + 1,
  };
}

function createTitleFromMessage(message) {
  const clean = message.replace(/\s+/g, " ").trim();

  if (!clean) return "New climate query";

  return clean.length > 42 ? `${clean.slice(0, 42)}...` : clean;
}

function shouldUseMessageAsTitle(chat) {
  return (
    chat.title === "New climate query" ||
    chat.title.trim() === "" ||
    chat.messages.filter((message) => message.role === "user").length === 0
  );
}

function isEmptyConversation(chat) {
  return chat && chat.messages.length === 0;
}

function areMockResponsesEnabled() {
  try {
    const saved = localStorage.getItem("pict-climate-risk-settings");
    if (!saved) return true;
    const settings = JSON.parse(saved);
    return settings.mockEnabled !== false;
  } catch {
    return true;
  }
}

function createMockResponseContent(userText) {
  const lower = userText.toLowerCase();

  if (lower.includes("map")) {
    return "I would generate a map-based climate risk view here. Later, this response will connect to spatial analysis functions and return a real map layer with uncertainty notes.";
  }

  if (lower.includes("trend") || lower.includes("over time")) {
    return "I would summarize projected climate trends here. Later, this will use climate projection data to describe direction, magnitude, and uncertainty over time.";
  }

  if (lower.includes("compare")) {
    return "I would compare selected countries, islands, or variables here. Later, this will call backend comparison functions and return differences, uncertainty ranges, and visual summaries.";
  }

  if (lower.includes("uncertainty")) {
    return "I would explain the uncertainty behind this result here. Later, this will include ensemble spread, model limitations, and decision-relevant caveats.";
  }

  return "This is a placeholder response. Later, this query will call the climate analysis backend and return maps, charts, trends, and uncertainty notes.";
}

export function useConversations() {
  const [conversations, setConversations] = useState(() =>
    sortConversationsByRecent(loadConversations())
  );
  const [activeConversationId, setActiveConversationId] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations]);

  const activeConversation = useMemo(() => {
    return conversations.find((chat) => chat.id === activeConversationId) ?? null;
  }, [conversations, activeConversationId]);

  function finishMockResponse(assistantMessageId, userText) {
  const mockEnabled = areMockResponsesEnabled();
  setTimeout(() => {
    setConversations((current) =>
      sortConversationsByRecent(
        current.map((chat) => {
          const hasTargetMessage = chat.messages.some(
            (message) => message.id === assistantMessageId
          );

          if (!hasTargetMessage) return chat;

          return {
            ...chat,
            messages: chat.messages.map((message) => {
              if (message.id !== assistantMessageId) return message;

              return {
                ...message,
                content: mockEnabled ? createMockResponseContent(userText) : "Mock responses are disabled. Toggle them on in Settings to see placeholder responses. The backend is not yet connected.",
                isLoading: false,
              };
            }),
            updatedAt: Date.now(),
          };
        })
      )
    );
  }, 900);
}

  function startNewConversation() {
    if (isEmptyConversation(activeConversation)) {
      return;
    }

    const existingEmptyChat = conversations.find((chat) =>
      isEmptyConversation(chat)
    );

    if (existingEmptyChat) {
      setActiveConversationId(existingEmptyChat.id);
      return;
    }

    const newChat = createConversation();

    setConversations((current) =>
        sortConversationsByRecent([newChat, ...current])
    );
    setActiveConversationId(newChat.id);
  }

  function startConversationFromPrompt(promptText) {
    const userMessage = createUserMessage(promptText);
    const loadingMessage = createLoadingAssistantMessage();

    if (isEmptyConversation(activeConversation)) {
      setConversations((current) =>
       sortConversationsByRecent(
        current.map((chat) => {
          if (chat.id !== activeConversation.id) return chat;

          return {
            ...chat,
            title: createTitleFromMessage(promptText),
            messages: [userMessage, loadingMessage],
            updatedAt: Date.now(),
          };
        })
        )
      );

      finishMockResponse(loadingMessage.id, promptText);
      return;
    }

    const newChat = createConversation({
      title: createTitleFromMessage(promptText),
      messages: [userMessage, loadingMessage],
    });

    setConversations((current) => [newChat, ...current]);
    setActiveConversationId(newChat.id);

    finishMockResponse(loadingMessage.id, promptText);
  }

  function sendMessage(messageText) {
    const userMessage = createUserMessage(messageText);
    const loadingMessage = createLoadingAssistantMessage();

    if (!activeConversationId) {
      const newChat = createConversation({
        title: createTitleFromMessage(messageText),
        messages: [userMessage, loadingMessage],
      });

      setConversations((current) => [newChat, ...current]);
      setActiveConversationId(newChat.id);

      finishMockResponse(loadingMessage.id, messageText);
      return;
    }

    setConversations((current) =>
      current.map((chat) => {
        if (chat.id !== activeConversationId) return chat;

        return {
          ...chat,
          title: shouldUseMessageAsTitle(chat)
            ? createTitleFromMessage(messageText)
            : chat.title,
          messages: [...chat.messages, userMessage, loadingMessage],
          updatedAt: Date.now(),
        };
      })
    );

    finishMockResponse(loadingMessage.id, messageText);
  }

  function deleteConversation(id) {
  setConversations((current) => {
    const remaining = sortConversationsByRecent(
      current.filter((chat) => chat.id !== id)
    );

    if (id === activeConversationId) {
      setActiveConversationId(remaining[0]?.id ?? null);
    }

    return remaining;
  });
}

  function clearConversations() {
    setConversations([]);
    setActiveConversationId(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  function selectConversation(id) {
    setActiveConversationId(id);
  }

  return {
    conversations,
    activeConversation,
    activeConversationId,
    startNewConversation,
    startConversationFromPrompt,
    sendMessage,
    deleteConversation,
    clearConversations,
    selectConversation,
  };
}