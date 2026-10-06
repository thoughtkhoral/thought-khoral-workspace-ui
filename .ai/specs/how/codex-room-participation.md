# Codex Room Participation — implementation design

## Status

Approved by the project maintainer in the Codex working session on 2026-10-05,
including this milestone-one specification and the coordinated implementation
plan. Accepted contribution: [issue 1](https://github.com/thoughtkhoral/thought-khoral-workspace-ui/issues/1).
Implementation follows the [plan](https://github.com/thoughtkhoral/thought-khoral/blob/main/.ai/specs/how/codex-room-conversations-implementation-plan.md) and its dependency gates.
Release/tag publication, provider use and service activation require their
separate later authorization. No completed runtime or live verification is claimed.

## Governing sources

- [Local requirements](../what/codex-room-participation.md)
- [Root solution design](https://github.com/thoughtkhoral/thought-khoral/blob/main/.ai/specs/how/codex-chat-agent.md)
- [Exact profile](https://github.com/thoughtkhoral/thought-khoral-contracts/blob/thought-khoral-agent-conversation-v1.0.0/.ai/specs/how/agent-conversation-profile.md)
- [Repository tasks and gates](https://github.com/thoughtkhoral/thought-khoral/blob/main/.ai/specs/how/codex-room-conversations-implementation-plan.md)

## Design

Keep the existing room socket for transcript/presence and use the separate
conversation HTTP API for explicit Codex submissions and controls. Use the current
access-token bootstrap adapter for Authorization headers; never URL tokens or
persisted browser credentials. A selected Codex target adds its canonical typed
mention and sends one profile request, not also chat.send. Before sending, obtain
the active generation/defaults and send explicit controls where selected. Restore
server state on reconnect and poll active tasks once per second. Disable reset
and settings while busy; unsent settings remain composer-local. Explain that New
session resets the shared thread while retaining room history. Targeted delivery
is unavailable for Codex. Join/Leave retains existing behavior, including stopping
polling and clearing room-local state without treating Leave as revocation.
The transcript uses the persisted reply message, not task-result text twice.
Capability absence hides optional controls. Follow existing PatternFly components
and accessibility conventions rather than introducing a second chat application.

## Verification

Use the exact contract fixture cases, root What acceptance criteria, and assigned
repository tasks in the plan. Scope tests to real protocol/storage/UI behavior;
fake only the provider/app-server boundary where a live dependency is unnecessary.
Publication/runtime execution requires accepted issue links and written review.
Do not claim live model, history, sandbox, or egress coverage from schema tests.

## Task 7 implementation checkpoint — 2026-10-06

The browser unit implements the approved Task 7 under [issue 1](https://github.com/thoughtkhoral/thought-khoral-workspace-ui/issues/1).
Its `conversationApi` client consumes the immutable release tag
`thought-khoral-agent-conversation-v1.0.0`, commit
`85baf86e574276fcd036e53e23641af6aad602f9`, archive SHA-256
`0038fdbf858db013c4a269aeedbca51a5db9128a2f1d6e39754f92ba60fd8f36`.
The unchanged artifact and release lock are under
`contracts/agent-conversation-v1`; the pin checker validates the lock itself,
the exact file set and every one of the 135 artifact SHA-256 values. Fixture
bytes remain unchanged. Browser types follow these schemas, with separate
AcceptedTurn and TaskView validators rather than accepting either response
variant interchangeably.

HTTP uses only the trusted gateway origin derived from the host's existing
socket URL (or the current origin). Access tokens travel only in Authorization,
never URLs, bodies or browser persistence. Redirects are rejected. Responses
are capped at 4 MiB and decoded as strict UTF-8. Before schema validation, JSON
parsing rejects duplicate or escaped duplicate keys, unpaired surrogates,
unsafe integers and non-decimal integer spellings. The client checks room,
agent, task and continuation bindings, catalog uniqueness/default membership,
state/active-task consistency, ordered unique updates and nested terminal result
bindings. Safe error text comes from an allowlist, never runtime diagnostics.
Catalog restoration follows only browser opaque cursors, rejects cursor cycles,
cross-page duplicate models and revision drift, and bounds restoration to 100 pages.

### Task 7/8 host admission handoff

The optional `window.thoughtKhoralWorkspace.conversationAdmission` bootstrap
declaration is a closed browser-local copy of the reviewed mediator card's
extension parameters. `profileVersion` represents its exact extension URI.
It contains no worker endpoint, credential or native thread binding:

```ts
type ConversationAdmission = {
  profileVersion: 'thought-khoral.agent-conversation.v1',
  agentId: '74686f75-6768-746b-686f-72616c000004',
  conversationScope: 'room',
  invocation: 'explicitly-addressed',
  delivery: 'room',
  roomHistory: 'baseline-and-delta',
  modelSelection?: boolean,
  reasoningEffort?: boolean,
  usageReporting?: boolean,
};
```

All six required values must match exactly; unknown fields and non-boolean
optional values fail closed. Missing optional capabilities hide their controls
independently. Presence in the room roster or catalog is not admission. The
host declaration only exposes the human UX; the broker remains authoritative
for current authorization and runtime admission. Task 8 owns supplying this
reviewed opt-in declaration. The default bootstrap remains disabled. An absent
conversation has no confirmed default model until the broker reports one;
the first turn can use server defaults without inventing settings.

The hook restores server state on connection/reload and immediately before
submission. It retains only composer-local unsent choices. New-session selection
requires shared-reset acknowledgement and submits mode `new` with the next
message; an unusable session requires that explicit choice. Accepted settings
stay visible while runtime confirmation is pending. Polls run one second after
each active task read and do not overlap. Terminal, Leave, unmount, reconnect
and authentication failure stop the old polling chain; generation-scoped
continuations ignore delayed responses from the prior connection. TaskView
assistant text is never added to the transcript. PatternFly's hidden live-region
announcement is preserved alongside the one visible persisted reply bubble.

### Dependency and verification checkpoint

Reviewed exact direct additions are [Ajv 8.20.0](https://registry.npmjs.org/ajv/8.20.0)
and [ajv-formats 3.0.1](https://registry.npmjs.org/ajv-formats/3.0.1), both MIT.
Ajv's strict draft-2020-12 validation uses only local schemas; schema compilation
disables `strictRequired` solely because the published conditional subschemas
refer to required properties declared by their parent. Instance validation,
closed objects, formats and strict types remain enabled.
The added graph is fast-deep-equal 3.1.3 (MIT), fast-uri 3.1.8 (BSD-3-Clause),
and json-schema-traverse 1.0.0 (MIT); require-from-string already existed.
All archive integrity values are pinned in `package-lock.json` and verified
against npm's content-addressed archive cache; archive license files match their
declared licenses.

The baseline audit reported source-map-js 1.2.1's high indexed-map DoS
GHSA-68fv-2mgg-jv7q and DOMPurify 3.4.13's low GHSA-p98j-92pf-mc4p and
GHSA-6688-9rhm-gjv2. The controller's narrow reviewed dependency ruling pins
[source-map-js 1.2.2](https://registry.npmjs.org/source-map-js/1.2.2)
(BSD-3-Clause) and [DOMPurify 3.4.16](https://registry.npmjs.org/dompurify/3.4.16)
(MPL-2.0 OR Apache-2.0) through exact overrides. It removes the duplicate
nested DOMPurify copy without upgrading unrelated packages. These patches
address pre-existing advisories with no intended UI behavior change. Their
archive integrity and licenses received the same review.

Task 7 verification uses real controls, the retained socket adapter, and a
mocked HTTP boundary. It covers direct/selected versus alias/quoted addressing,
one submission, targeted-delivery rejection, retained drafts, explicit reset,
effort acknowledgement, local versus accepted/confirmed settings, optional
controls, context freshness/zero/unavailable states, shared-session restoration,
reload, terminal polling, Leave/auth loss and delayed old-generation responses.
It preserves all retained deterministic task tests. Production build and
entry-to-lazy-ChatBot preview remain separate required gates. The existing
Vite large-chunk advisory remains; no broad chunk restructuring is included.
These checks establish browser behavior with synthetic responses, not live
provider, browser-to-broker deployment, room-history disclosure, sandbox or
egress coverage. Provider use and service activation remain gated separately.
