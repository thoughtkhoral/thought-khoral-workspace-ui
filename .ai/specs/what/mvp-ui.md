# ThoughtKhoral MVP workspace UI

## Sole MVP responsibility

`thought-khoral-workspace-ui` renders the governed room experience and gives human participants the controls to confirm, edit, or dismiss draft decisions.

## Acceptance criteria

- The UI starts in an explicit unjoined state. A host-provided `roomId` or
  `?room=` value may prefill the room entry control, but it never joins a room
  by itself.
- A human may enter a room only by choosing or confirming a non-empty UUID-format
  room ID; invalid room IDs are rejected before access-token acquisition,
  authenticated socket setup, or `room.join`.
- While unjoined, the UI shows a PatternFly room-entry state and does not show
  chat sending, decision-transition controls, collective memory, participant
  presence, or a replayed transcript as an active session.
- Leave is an explicit UI action that closes the socket, cancels reconnect,
  clears joined room state, and returns to the unjoined state without clearing
  OIDC tokens or deleting room history.
- Closing a tab and revisiting the UI does not silently re-enter the previous
  room. Keycloak SSO may skip the password form, but that does not count as
  room membership or room entry.
- The UI renders normalized room messages and decision events from the gateway.
- In a joined room, the composer offers known human and agent participants and
  the fixed `@allhumans` and `@allagents` aliases. A human can choose the
  default room-wide delivery or mentioned-only delivery, which includes the
  sender; the UI blocks unresolved targets, an empty mentioned-only audience,
  and more than 50 unique targets. Delivered mentions and targeted-delivery
  labels are accessible in the transcript.
- The UI renders normalized agent-task lifecycle events as room-visible,
  agent-attributed task cards and discovers registered executable agents through
  the existing participant/mention interaction.
- For the local A2A reference agent, a human may explicitly choose
  `summarize-context` or `extract-action-items` and start a task. The UI shows
  server-produced progress, source-cited terminal results, and any validated
  external-input instruction and HTTPS link; it does not open or embed the
  agent's human-in-the-loop experience automatically.
- A human viewing a draft decision can invoke Confirm, Edit, or Dismiss; an agent sees no decision-transition control.
- A human can enter the exact `/decisions` command to open local Create,
  Update, Delete, or Cancel controls. The command itself is not sent as chat;
  Delete requires confirmation, and a successful mutation produces one room
  result message only after the matching persisted event. Cancel is silent.
- The active collective-memory view is read-only and shows only decisions that the gateway has made active.
- The conversation roster opens as a PatternFly start-side overlay drawer and lists every known human and agent with its trusted display name, role, and explicit Online or Offline state.
- The production document title, workspace heading, and accessibility labels identify the product as ThoughtKhoral.
- The npm package and browser bootstrap namespace use `thought-khoral-workspace-ui` and `thoughtKhoralWorkspace` respectively.

## Interfaces

The UI consumes an optional host room suggestion, an optional `onEnterRoom`
callback, and an optional `onLeaveRoom` callback through
`window.thoughtKhoralWorkspace`:

```ts
interface ThoughtKhoralWorkspaceBootstrap {
  roomId?: string;
  participantRole: 'human' | 'agent';
  getAccessToken: () => Promise<string>;
  createSocket: (url: string, accessToken: string) => RoomWebSocket;
  socketUrl?: string;
  onEnterRoom?: (roomId: string) => void;
  onLeaveRoom?: () => void;
}
```

It consumes authenticated retained-v1 room events and participant
snapshots/updates, and uses `room.join`, `chat.send`, `decision.propose`,
`decision.transition`, `decision.delete`, and human `agent.task.start`
JSON-RPC requests through the gateway WebSocket only
after explicit entry. Renaming the browser bootstrap namespace does not change
the host-provided access-token acquisition or authenticated socket behavior,
including its `session.authenticate` exchange.

For `chat.send`, the UI sends typed mention targets and `room` or `mentioned`
delivery. It uses roster-derived canonical tokens for participant targets;
the gateway remains authoritative for target validation, audience resolution,
live delivery, and replay under the root [message delivery design](https://github.com/thoughtkhoral/thought-khoral/blob/main/.ai/specs/how/message-mentions-and-delivery.md).

Root [decision 008](https://github.com/thoughtkhoral/thought-khoral/blob/main/.ai/specs/decisions/008-slash-decisions-and-facilitator-boundary.md)
governs the human slash-decisions workflow and leaves the gateway authoritative
for deletion, audit history, and active context.

The host callbacks are lifecycle notifications and room-URL binding hooks;
they do not replace gateway protocol methods and do not carry credentials.

## Explicit exclusions

This project does not define the contract, add a `room.leave` RPC, create
durable membership, kick participants, wipe history, validate or persist
authoritative events, issue identity tokens, operate Keycloak or PostgreSQL,
run a facilitator, or make unmediated agent/tool calls.
