## ADDED Requirements

### Requirement: Messaging Interface
The system SHALL display user messages right-aligned with a dark background and assistant messages left-aligned with a light background.

#### Scenario: Send user message
- **WHEN** user types "Show wet-bulb temperature" and clicks the send button
- **THEN** the message is added to the active conversation history and a typing indicator showing three pulsing dots is rendered.

### Requirement: Conversational History Management
The system SHALL preserve user conversation histories in local storage and list them in the sidebar drawer sorted by the most recent activity.

#### Scenario: Delete conversation thread
- **WHEN** user clicks the "Delete" button on a conversation row in the sidebar
- **THEN** the conversation is removed from local storage and the active view falls back to the next available chat.

### Requirement: GIS Workflow Link Parser
The system SHALL automatically intercept ` ```json-workflow ` code blocks inside assistant messages, parse the payload, and render an interactive callout card with an action button to mount the pipeline.

#### Scenario: Trigger map inspection
- **WHEN** user clicks "Inspect & Run on Map" on a workflow card
- **THEN** the system dispatches the workflow details to the map layer preview component.
