# ThoughtKhoral MVP workspace UI

## Sole MVP responsibility

`thought-khoral-workspace-ui` renders the governed room experience and gives human participants the controls to confirm, edit, or dismiss draft decisions.

## Acceptance criteria

- The UI renders normalized room messages and decision events from the gateway.
- A human viewing a draft decision can invoke Confirm, Edit, or Dismiss; an agent sees no decision-transition control.
- The active collective-memory view is read-only and shows only decisions that the gateway has made active.
- The production document title, workspace heading, and accessibility labels identify the product as ThoughtKhoral.
- The npm package and browser bootstrap namespace use `thought-khoral-workspace-ui` and `thoughtKhoralWorkspace` respectively.

## Interfaces

The UI consumes authenticated `n2n.room.v1` room events and uses `room.join`, `chat.send`, and `decision.transition` JSON-RPC requests through the gateway WebSocket. Renaming the browser bootstrap namespace does not change the host-provided access-token acquisition or authenticated socket behavior, including its `session.authenticate` exchange.

## Explicit exclusions

This project does not define the contract, validate or persist authoritative events, issue identity tokens, operate Keycloak or PostgreSQL, run a facilitator, or make unmediated agent/tool calls.
