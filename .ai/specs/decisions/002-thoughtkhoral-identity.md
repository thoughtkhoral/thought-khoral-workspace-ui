# 002 — ThoughtKhoral project identity

## Status

Accepted

## Decision

This repository implements root [Decision 003 — ThoughtKhoral product identity](../../../../.ai/specs/decisions/003-thoughtkhoral-product-identity.md). Its direct-child directory is renamed exactly from `n2n-workspace-ui` to `thought-khoral-workspace-ui`.

Active project identity uses `ThoughtKhoral` in visible browser copy and `thought-khoral-workspace-ui` in package metadata. The browser host bootstrap namespace is `thoughtKhoralWorkspace`; this namespace change does not alter its token callback, authenticated socket adapter, or the adapter's `session.authenticate` behavior.

The existing `n2n.room.v1` protocol values remain wire-compatible and unchanged. Database identifiers, database contents, persisted records, persisted fields, and persisted values are excluded from this rename.

## Consequences

- New project-facing identifiers use `thought-khoral-workspace-ui`.
- Visible headings, the HTML title, and accessibility labels use `ThoughtKhoral`.
- Host applications provide the browser bootstrap through `window.thoughtKhoralWorkspace`.
- A future protocol or data rename requires its own approved compatibility and migration decision.
