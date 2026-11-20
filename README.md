# ThoughtKhoral workspace UI

[Project documentation](docs/README.md) · [Documentation requirements](.ai/specs/what/public-documentation.md)

## Current workspace context — 2026-11-20

Released-v1.1 defaults consumption is implemented and reviewed at local source `29a940012adfeb796f59c5b89b00cab7a4d0df68`. It preserves historical vendors and the dependency lock; 193 tests passed with one intentional composed skip, plus TypeScript/build and pin/tamper checks. This is component evidence, not real-browser or provider acceptance.

This is the prepared source branch: its released imports/profile are present.
Its frozen implementation commit above remains the acceptance identity; later
documentation commits are evidence followups. The branch remains unpushed/unmerged.

Derived from the [local specification index](.ai/specs/README.md) and
[root workspace authority](https://github.com/thoughtkhoral/thought-khoral/blob/main/.ai/specs/how/workspace-state.md).
The cited tests retain their original source identities; this documentation
refresh adds no activation, publication or runtime acceptance.

The local released-defaults transition loads the resolved-settings schema from
verified conversation v1.1.0 at source `f1c8621`. Pretest/prebuild verify its
external release-lock anchor, all 156 payload files and tamper refusals while
preserving the historical candidate and published v1.0 vendors. See the
[owning specification](.ai/specs/how/released-defaults-consumption.md).
This transition changes no controls or wire behavior and grants no live or
packaged-browser acceptance.

`thought-khoral-workspace-ui` is the React/Vite browser workspace for governed
ThoughtKhoral rooms. It renders chat, active context, and human Confirm/Edit/
Dismiss controls for draft decisions.

## Status

MVP / active development.

For the cross-project Codex conversation status and remaining gates, see the [shared status guide](https://github.com/thoughtkhoral/thought-khoral/blob/main/docs/codex-conversation-status.md).

The [current UI checkpoint](.ai/specs/how/codex-room-participation.md#current-ui-verification-scope--2026-11-19)
records the integrated/pushed Codex/defaults candidate and its provider-free
synthetic acceptance. The v1.1 artifact is published; canonical versus prepared imports are
distinguished in the current workspace context above. Task 9 opt-in
packaged-stack, rendered-browser/Keycloak, live-provider and production/release
acceptance remain open; separate native Linux worker results add no UI coverage.

## Prerequisites and verification

Use Node.js `^20.19.0` or `>=22.12.0` and npm:

```sh
npm ci
npm test
npm run build
npm run test:preview
```

`npm run dev` starts the Vite development server. End-to-end operation requires
the authenticated gateway and the local platform's OIDC configuration; the UI
does not own identity validation, persistence, or authoritative decision
transitions.

The UI implements the retained v1 room request and event interface. Its
protocol constant is a compatibility value, while the contracts repository
owns the schemas and the gateway enforces authorization. Update the UI against
a reviewed contract revision before relying on new fields or events.

## Message mentions and delivery

In a connected room, type `@` in the message composer to select known human or
agent participants. The fixed aliases `@allhumans` and `@allagents` are always
available. Manually typed unknown or stale tokens disable Send rather than
creating a message for an unknown participant.

Choose **Everyone in room** for the default room-wide message, or **Mentioned
participants only** to deliver to the resolved mention audience and yourself.
`@allhumans` reaches human participants; `@allagents` reaches agents and is
also visible to all humans. The composer supports up to 50 unique targets and
renders delivered mentions and targeted-delivery labels accessibly in the
transcript.

See the [local specification index](.ai/specs/README.md) and the
[repository map](https://github.com/thoughtkhoral/thought-khoral/blob/main/docs/repository-map.md).

## Decision workflow

In a joined room, a human can enter `/decisions` to open Create, Update,
Delete, or Cancel controls. The command itself is not posted to chat. Delete
requires confirmation; a successful mutation posts one result after the
gateway persists its event. Cancel and failed mutations post no result.
Agents do not receive decision-mutation controls, and `Decision:` chat text
does not create a proposal automatically.

## Local reference-agent tasks

In a joined room, a human can explicitly start either `summarize-context` or
`extract-action-items` for the pinned local A2A reference agent. The transcript
shows room-persisted progress and a cited terminal result. If an agent task
requires external human input, the UI shows its instruction and validated
HTTPS link for the user to choose; it does not open that page automatically or
host the agent's input flow. The UI does not invoke A2A directly or admit
arbitrary remote agents. The earlier `@action-items` mention path remains a
separate in-process deterministic task.

## Codex shared room conversations

This UI unit implements [issue 1](https://github.com/thoughtkhoral/thought-khoral-workspace-ui/issues/1)
under the [local Codex requirements](.ai/specs/what/codex-room-participation.md)
and [implementation design](.ai/specs/how/codex-room-participation.md).
The OIDC-enabled host must explicitly declare the reviewed conversation
admission in its bootstrap. Controls remain hidden when that declaration is
absent or invalid. The broker still determines current permission and availability.

When available to a human participant, choose **Codex Agent** as the conversation
target or directly address `@codex-agent`. This sends one conversation request
and posts the accepted human message through the broker. Aliases, quotations,
and code mentions remain ordinary room chat. Codex conversation delivery is
room-wide. A rejected request retains the unsent draft.

**Continue session** uses the room's current shared thread, including turns by
other humans. **New session** prepares a fresh thread for the next submitted
message and requires acknowledgement that it resets the thread for everyone;
room history remains. Model and effort choices are local until submission.
Initial and New sessions display the broker's validated concrete defaults.
Continuation displays the shared session's persisted model and effort. Settings
capabilities are independent: an unsupported counterpart is visible read-only;
with neither capability, there are no settings controls or catalog/default reads.
A model-only edit displays that model's catalog default effort. With both
capabilities, a changed model's unsupported prior effort requires acknowledgement
of the new default or an explicit supported effort choice. Unavailable or stale
settings block sending until **Refresh settings** reviews current values. The controls distinguish selected settings from confirmed
runtime settings and label context estimates by their last request and freshness.
Task results provide status; assistant text appears through the persisted room
transcript once. Leaving clears the local conversation state and stops polling.

The exact published profile is vendored under `contracts/agent-conversation-v1`.
`npm run check:contracts` verifies its immutable lock and all 135 file hashes;
`npm run test:contracts` exercises fixture, extra-file, and lock tampering in a
temporary copy. Production defaults validation uses the released vendor under
`contracts/agent-conversation-v1.1`; `check:defaults-release` and
`test:defaults-release` enforce its exact lock/payload and seven tamper cases.
The historical **unreleased-candidate** vendor remains under
`contracts/agent-conversation-v1.1-candidate`, from contracts commit
`1ea828f28725ddaaefa21d083473f9abbd777975`. `npm run check:defaults-candidate`
checks its external lock digest, all 156 payload hashes, and the unchanged
released subset; `npm run test:defaults-candidate` checks tampering, missing/extra
files and symlinks. The normal test and build commands run both pin gates.
This candidate is authorized only for local synthetic verification.

`CodexDefaults.composed.test.tsx` is skipped normally. Task 4 may opt in with
`RUN_CODEX_DEFAULTS_COMPOSED=1`, `CODEX_DEFAULTS_BROKER_ORIGIN`,
`CODEX_DEFAULTS_ROOM_ID`, `CODEX_DEFAULTS_TOKEN`,
`CODEX_DEFAULTS_PHASE=initial|restored|new`,
`CODEX_DEFAULTS_MODEL_SELECTION=true|false`,
`CODEX_DEFAULTS_REASONING_EFFORT=true|false`, and
`CODEX_DEFAULTS_EVIDENCE_FILE` pointing to a fresh temporary file. This uses the
real RoomPage/ChatStream/controls and HTTP conversation responses with a synthetic
room socket fixture. It captures the DOM pair before Send, clones the real
acceptance, writes evidence exclusively, and leaves immediately. It establishes
no provider, image, deployment or live-browser verification.

## Contributing

Start with an issue in this repository. UI changes must reference the accepted
issue, governing specification, and verification command. See the
[organization contribution guide](https://github.com/thoughtkhoral/.github/blob/main/CONTRIBUTING.md).
