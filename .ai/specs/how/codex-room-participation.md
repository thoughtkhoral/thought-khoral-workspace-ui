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

### Independent review correction checkpoint

Task 7 review round 1 corrected the failed terminal update projection: its
closed `{code}` data is compared with the failure code, while the failure's
diagnostic message is never displayed. Completed updates retain full semantic
result comparison, independent of JSON object member order and with ordered
arrays. The browser's discriminated update type now represents each published
update variant, including the failed update's code-only shape.

A binding-matched current task is authoritative for effective settings and
usage, including null metadata. Pending acceptance also suppresses prior-turn
usage. A model change therefore remains unconfirmed and its estimate unavailable
until that task supplies metadata; a previous confirmed model and fresh estimate
cannot be restored by null fallback. Strict metadata parsing additionally allows
a null model context window only when freshness is `unavailable`.

Direct-address classification excludes matching backtick delimiter runs and
backtick or tilde fenced code. Shorter fence runs do not close a longer fence.
These drafts remain ordinary chat; an explicitly selected Codex target still
inserts the canonical typed mention outside the quoted/code text. This browser
classification correction preserves the existing broker authorization boundary
and the host admission handoff above.

Six new regressions first failed on the reviewed implementation and then passed:
the immutable published failed TaskView, timeout/interruption recovery with
explicit New session, a new model's pending/null metadata followed by its own
confirmation, Markdown code routing through the real composer, and paired
null/unavailable versus positive/stale context-window parsing. Final verification
passed 116 tests in 12 files, the production build, and the visible room preview
with 19 retained ChatStream tests. The 135-file artifact pin and tamper checks
passed; npm audit reported zero vulnerabilities. The existing large-chunk build
advisory and the deployment/provider verification limits above remain unchanged.


## Published-v1 fresh-selection safety correction (2026-10-07)

A settings-capable initial invocation or explicit New/reset requires a deliberate
valid model/effort selection before submission. Fresh-mode pickers start blank,
including when only one model/effort is available; the previous session's pair
remains only in the runtime-confirmed header. A model's supported default effort
is displayed and must be acknowledged (or explicitly changed) before sending.
The visible selected pair is sent atomically. A capability without settings
continues without these controls. Continuations use accepted shared defaults.

The published catalog does not disclose the deployment-default model when no
conversation exists. This guard satisfies concrete selection and prevents an
unseen default from running, but automatic resolved-default display remains a
pending design gap under the approved root How. No default is inferred from
catalog order; no new endpoint or changed published artifact is implemented.

## Approved defaults-discovery amendment — 2026-10-07

The maintainer approved the [visible server defaults design](https://github.com/thoughtkhoral/thought-khoral-codex-agent/blob/main/.ai/specs/how/default-settings-discovery-proposal.md) in
this conversation on 2026-10-07 after an explicit specification approval request.
It authorizes coordinated local implementation and synthetic verification of
the additive authenticated defaults query and independently optional model/effort
controls, including the F1 initial/reset effort-only deadlock. The accepted
design is the governing amendment to earlier default-visibility wording.

The contracts owner defines `ResolvedSettingsView` at
`GET /api/agent-conversations/v1/rooms/{roomId}/agents/{agentId}/defaults` in
new immutable artifact `thought-khoral-agent-conversation-v1.1.0`, retaining the
v1 profile/namespace and all existing published v1.0 schema/fixture bytes.
The broker validates authenticated room/agent authority, current admission,
catalog revision, policy-default pair and five-second bound before responding.
The read has no task/event/conversation/lease/native-state mutation, exposes no
effective-settings confirmation, credentials or private/native identifiers,
uses the existing safe ProfileError/HTTP mapping and `Cache-Control: no-store`.
There is no inferred catalog-order model or inference fallback.

The UI resolves and displays the concrete explicit next-turn pair when absent
or explicitly New/reset; restored continuation uses accepted shared settings.
Both capabilities allow both controls; effort-only keeps the resolved model
read-only; model-only keeps the displayed model-specific catalog default effort
read-only; neither capability retains the settings-free path. Unsupported
controls stay uneditable and no hidden control blocks a valid required choice.
Catalog/pair mismatch requires bounded refresh or an explicit unavailable state.
A still-valid explicit pair is not replaced after a deployment-default-only change.

As a scoped exception to the earlier published-artifact-first execution order,
isolated consumers may pin a reproducible local candidate from an exact committed
contracts revision, verified archive and per-file SHA-256 values, clearly marked
unreleased. This exception is only for this amendment's local pre-publication
development and synthetic testing. Published v1.0 provenance/bytes remain intact.
No release publication, shipped interoperability, merge, push, provider use or
service activation is authorized. Whole milestone/Task9 acceptance remains open.

### Task 3 local implementation checkpoint — 2026-10-07

The browser consumes only the candidate's new `ResolvedSettingsView` schema,
registering its reference to the existing published turn schema once. The released
135-file vendor and published pin checker remain unchanged. The local candidate
has 156 exact payload files, contracts commit
`1ea828f28725ddaaefa21d083473f9abbd777975`, archive SHA-256
`fab59a486f6498b843467202debcb0768403bd57ba7dda41be2a01e5f23fdda8`, and lock SHA-256
`7914d32eae2487879a68405b5095a6b9aa91355f87529c43f4055844821902a9`.
The defaults client shares the published bounded strict parser and authenticated,
no-store, credential-free, redirect-rejecting HTTP wrapper. It checks request
room/agent bindings and rejects mismatched explicit acceptance settings.

Settings acquisition restores authenticated conversation state, traverses at most
100 catalog pages, and obtains defaults only for absent or explicit New sessions.
A concrete pair is validated against the complete catalog before enabling submit.
Room epochs and settings-request sequences reject delayed discovery after New,
Continue, later edits, Leave, room switching or authentication loss. Independent
primitive capabilities govern both hook edits and controls. The sole selected
pair supplies editable/read-only values and the explicit request. Submission
captures that displayed pair before its server-generation refresh, never querying
deployment defaults again. Neither capability keeps catalog/default reads and
submitted settings absent. New retains shared-reset acknowledgement.

Stale, removed or unresolved pairs become unavailable without guessing a model.
Refresh settings is a single bounded human action; a persisted allowed model/effort
can be reviewed against a changed revision without mutating stored state before
acceptance. Rejections retain the draft and never replay automatically. Cached
catalog edits and Continue cannot revive failed discovery without that review.

Synthetic regression coverage includes all four capability combinations across
initial, restored and New phases, F1 effort-only editing/submission, bounded catalog
failures, absent/removed/revision mismatches, policy-only changes, prompt retention,
immutable explicit acceptance and async discovery cancellation. The composed child
is opt-in and uses real HTTP responses with actual RoomPage/ChatStream/controls,
records the DOM pair before Send plus real acceptance in fresh temporary evidence,
and then Leaves. A normal-suite skip is expected; Task 4 owns actual composed
execution. Publication, provider calls, activation, image/native/tool-policy changes,
merge and push remain outside this checkpoint.
