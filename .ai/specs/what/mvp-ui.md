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
- The UI renders normalized agent-task lifecycle events as room-visible,
  agent-attributed task cards and discovers registered executable agents through
  the existing participant/mention interaction.
- A human viewing a draft decision can invoke Confirm, Edit, or Dismiss; an agent sees no decision-transition control.
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
snapshots/updates, and uses `room.join`, `chat.send`, and
`decision.transition` JSON-RPC requests through the gateway WebSocket only
after explicit entry. Renaming the browser bootstrap namespace does not change
the host-provided access-token acquisition or authenticated socket behavior,
including its `session.authenticate` exchange.

The host callbacks are lifecycle notifications and room-URL binding hooks;
they do not replace gateway protocol methods and do not carry credentials.

## Explicit exclusions

This project does not define the contract, add a `room.leave` RPC, create
durable membership, kick participants, wipe history, validate or persist
authoritative events, issue identity tokens, operate Keycloak or PostgreSQL,
run a facilitator, or make unmediated agent/tool calls.
