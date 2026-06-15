# Redesign Plan: Old Chatbot UI + Mapbox Globe

## Keep
- **Map**: Mapbox GL globe (1060x836 with explicit pixel sizing)
- **Header**: Pacific Map title, search bar, Spatial Query toggle
- **Layout**: Right sidebar (380px) + map
- **SettingsModal**: Already ported (3 tabs, localStorage)
- **DrawControls**: `@mapbox/mapbox-gl-draw` integrated with Spatial Query button
- **mockData.ts**: Extracted placeholder data with toggle system
- **Backend**: Express server on port 3000

## Replace
Replace inline chat UI in the sidebar with old chatbot's standalone components:

| Old component | New home | Replaces |
|---|---|---|
| `Sidebar.jsx` → `Sidebar.tsx` | Right panel (top) | Inline conversation list |
| `MainChat.jsx` → `MainChat.tsx` | Right panel (fill) | Inline chat timeline + empty state |
| `ChatInput.jsx` → `ChatInput.tsx` | Bottom of sidebar | Floating chat input pill |
| `useConversations.js` → `useConversations.ts` | State management | Inline `chatTimeline`/`recentQueries` state |
| `PromptCard.jsx` → `PromptCard.tsx` | Used by MainChat | Inline Quick Start buttons |
| `starterPrompts.js` → `starterPrompts.ts` | Data for PromptCard grid | mockQuickStarts |
| `HelpModal.jsx` → `HelpModal.tsx` | Help button | Current help |

## Proposed Sidebar Structure

```
┌──────────────────────────────┐
│ Sidebar (380px, top-16→bot)  │
│                              │
│ [Sidebar.tsx adapted]        │
│  ─ Conversation list         │
│  ─ New chat button           │
│  ─ Search conversations      │
│  ─ Clear All                 │
│                              │
│ ──────────────────────────── │
│                              │
│ [MainChat.tsx]               │
│  ─ Messages (when active)    │
│  ─ OR Empty state hero       │
│    (PromptCard grid)         │
│                              │
│ ──────────────────────────── │
│ [ChatInput.tsx]              │
│  ─ Text input + send         │
│                              │
│ ──────────────────────────── │
│ Settings | Help buttons      │
└──────────────────────────────┘
```

## Files to Create/Convert

| File | Action |
|---|---|
| `src/components/Sidebar.tsx` | Convert from `frontend/src/components/Sidebar.jsx` |
| `src/components/MainChat.tsx` | Convert from `frontend/src/components/MainChat.jsx` |
| `src/components/ChatInput.tsx` | Convert from `frontend/src/components/ChatInput.jsx` |
| `src/components/PromptCard.tsx` | Convert from `frontend/src/components/PromptCard.jsx` |
| `src/components/HelpModal.tsx` | Keep current or port old version |
| `src/state/useConversations.ts` | Convert from `frontend/src/state/useConversations.js` |
| `src/data/starterPrompts.ts` | Convert from `frontend/src/data/starterPrompts.js` |

## Files to Modify

| File | Change |
|---|---|
| `src/App.tsx` | Replace inline chat + sidebar with Sidebar/MainChat/ChatInput; remove floating chat input; remove `chatTimeline`/`recentQueries`/`userChatInput` |
| `e2e/full-test.mjs` | Update selectors |

## Implementation Order

1. **Backup**: `git add -A && git commit -m "backup: bot-chat-frontend before old-ui integration"`
2. **Convert old components to TSX**: Sidebar, MainChat, ChatInput, PromptCard, useConversations, starterPrompts
3. **Rewrite App.tsx**: Replace inline state and JSX with old components
4. **Update tests**
5. **Build and verify**

## Key Props for Ported Components

### Sidebar.tsx
```ts
interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onNewChat: () => void;
  onClearAll: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}
```

### MainChat.tsx
```ts
interface MainChatProps {
  activeConversation: Conversation | null;
  onPromptClick: (promptText: string) => void;
  onSendMessage: (text: string) => void;
}
```

## What Gets Removed from App.tsx
- `chatTimeline` state → moved to `useConversations`
- `recentQueries` state → moved to `useConversations`
- `userChatInput` state → moved to `ChatInput`
- `isAnalyzing` state → optional, rework as needed
- `triggerAssessment` function → replaced by `sendMessage`
- All inline chat JSX (lines ~299-390)
- Floating chat input div (lines ~393-408)

## What Stays in App.tsx
- Map initialization (Mapbox GL, fog, markers)
- Header (title, search, Spatial Query)
- Map container sizing logic
- Place pin drawing + marker rendering
- SettingsModal
- Mock data toggle logic
