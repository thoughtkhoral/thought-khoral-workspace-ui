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

## Task 9 synthetic verification and correction checkpoint — 2026-10-07

The following defaults-discovery amendment status supersedes this pre-amendment F1/default-discovery disposition; Task 9 remains open for release gates.

Provider-free checkpoint only; Task 9 and the milestone remain open.

Task-scoped verification review: Approved. Broad implementation review: Partial
spec compliance; quality Needs follow-up. B1–B3 (pending-ack recovery, omitted
shared settings and receipt-correlated safe failures) are addressed. B4 is
partial: explicit initial/reset selection works for full-capability admission,
but automatic server-default display requires an approved interface amendment.
F1: unresolved Important reasoning-only UI deadlock. Optional capabilities are
independent; an effort-only admission cannot establish the guard-required model
through its hidden selector. This prevents initial/reset invocation and blocks
whole-milestone/merge readiness. No second broad fix wave or waiver is implied.

| Owner | Final reviewed local revision |
|---|---|
| contracts | `85baf86e574276fcd036e53e23641af6aad602f9` |
| broker | `fd05cb48b8508e7939f9cdf9df275742a06fc4f8` |
| mediator | `6c3d96b4763871b9addc9bc7223e71ee7d38abd9` |
| worker | `b0d43ec2b5b0c8da035d4ccff754545132b978d4` |
| ui | `e51d67e9e1a986601df6b5e1acf68aaf7ae0870d` |
| platform | `637a69279f0fe5019560b1e54d28f48c1c715897` |

All six reviewed worktrees were clean when this checkpoint was prepared.
Runtime is committed only on isolated local branches; originals retain their
runtime/scaffold and unrelated edits. Contracts v1.0.0 and dependency lockfiles
remain unchanged.

Controller final verification on platform revision above: `node
scripts/smoke-codex-conversation.mjs --fake` (session85023) exit0, six original
crash/commit boundaries, 11 fake native turns, exact baseline/delta/source IDs,
targeted/cross-room exclusion, duplicate=one logical turn, worker restart and
fresh reset, shared omitted settings, rejected-completion recovery and exact
execution_failed/session_unavailable/runtime_unavailable projections. `node
--test scripts/tests/codex-conversation-smoke.test.mjs` (session23304) exit0,
13 passed, zero failed. This is synthetic native/identity/private-DNS adapter
coverage, not whole packaged Compose, real Keycloak/browser or provider proof.

Inspected owner logs and independent review record broker150 passed + one
pre-existing ignored live test; mediator65 passed, zero failed/ignored (correcting
the earlier reported68); worker46; UI121 + pin/tamper checks and production
build. Owner fixture tests3, actual assertion-failure/SIGTERM/SIGINT cleanup3,
package/startup checks10 passed. Earlier contracts/regression/legal/pin evidence
is retained with original attribution, not presented as rerun here.

New ARM64 worker image:
`sha256:2d8bfade27802f910cf68e832722c93b4a2acc2addb825711e1223617a4cd385`.
Compiled runtime revision `b418a76e0e7ca047b5fe995eb17519aced369a06`; worker
head above adds evidence documentation. Immutable image readiness checks used
network-none/read-only/cap-drop-all, both admission markers; default invocation
refused as expected. Actual native 44-setting/eight-model/resume/six unsolicited
tool refusal evidence remains attributed to its earlier source/image, not this
new image. CLI/catalog/control hashes are unchanged. x86_64 native admission and
Rust1.85 minimum-version checks remain unrun.

Default discovery: pending specification approval. The local proposed How is
`thought-khoral-codex-agent/.ai/specs/how/default-settings-discovery-proposal.md`.
It proposes a read-only authenticated defaults query in a new immutable v1.1.0
artifact and independent mixed-capability controls, covering absent conversation
and explicit New/reset. It authorizes no runtime or published contract changes.
Live provider verification: pending. Account/model availability, actual native
history, live tool/egress/key isolation, packaged deployment/private DNS and real
browser/identity evidence remain separately gated. No merge, push, publication,
service activation or provider inference occurred.

Independent review artifacts are retained outside Git at
`/private/tmp/codex-conversation-task9/final-fix-review.md`,
`final-implementation-review.md`, and `task9-fix-review.md`; owner evidence at
`/private/tmp/Task9-final-fix-evidence/`. Final root/documentation/source-reference
and identity gate results will be recorded in the controller checkpoint after
these source-derived record updates. The aggregate release checklist remains
unchecked; passing synthetic checks do not resolve F1 or default discovery.

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

## Defaults discovery local synthetic checkpoint — 2026-10-07

All four defaults-amendment tasks passed their independent reviews. The final
whole-branch review passed. F1 (initial/New reasoning-only settings deadlock) and
visible defaults discovery are accepted for this local synthetic candidate.

| Source | Exact local revision | Retained worktree |
| --- | --- | --- |
| contracts | `1ea828f28725ddaaefa21d083473f9abbd777975` | `/private/tmp/codex-conversation-defaults/contracts` |
| broker | `2e7d23b467c572819f498c3b9bf14d74a62dc821` | `/private/tmp/codex-conversation-defaults/room-gateway` |
| mediator | `6c3d96b4763871b9addc9bc7223e71ee7d38abd9` | `/private/tmp/codex-conversation-final-fix/agent-gateway` |
| worker | `b0d43ec2b5b0c8da035d4ccff754545132b978d4` | `/private/tmp/codex-conversation-final-fix/worker` |
| ui | `79e5e7310a450efea561548cd87871446c1939aa` | `/private/tmp/codex-conversation-defaults/workspace-ui` |
| platform | `2d856773078a7caa542d719e539b55a5ab2dafaa` | `/private/tmp/codex-conversation-defaults/platform` |

The composed run was executed at `f9afeb20b746200daa9cdef0406c03f88a422b68`.
The subsequent path-provenance correction was tested and scoped-reviewed at
`220f6e0c74a29c000d7de81c0cb77823de0bd15c`;
the final platform revision above adds completion metadata only. The original
repositories retain their runtime; local implementation branches remain unmerged.

The unreleased candidate contract source is
`1ea828f28725ddaaefa21d083473f9abbd777975`, proposed release
`thought-khoral-agent-conversation-v1.1.0`. Its archive SHA-256 is
`fab59a486f6498b843467202debcb0768403bd57ba7dda41be2a01e5f23fdda8`
and externally anchored lock SHA-256 is
`7914d32eae2487879a68405b5095a6b9aa91355f87529c43f4055844821902a9`.
All 156 candidate payload files match in broker/UI; published v1.0 bytes remain
unchanged. The profile and API namespace stay v1. This is not a published release.

Evidence: retained 125 contract fixtures plus 16 additive cases and 6 candidate
integrity tests; broker serial suite 158 passed with 1 existing live-only test
ignored; UI full suite 190 passed with 1 intentional composed skip, followed by
scoped harness/TypeScript checks; 26 source-pin and 13 retained runner guards;
5 fixture unit tests; 3 actual failure/SIGTERM/SIGINT cleanup cases. The composed
candidate passed 12 capability/lifecycle cases, 3 display/send mutation cases,
15 actual HTTP UI children with 90 test passes, and 24 synthetic native turns
(11 retained baseline plus 13 added). Stale/removed pairs allocate no task/event
or native turn, retain the prompt and require explicit Refresh. Default-only
changes preserve the displayed explicit pair; unavailable replay is immutable.
Paused-publisher regressions verified RED before and GREEN after atomic exclusive
handshake publication. Owned processes, containers and staging files were cleaned.

The current composed state is `/var/folders/70/5kxy5kys3bj0252chp3ck8900000gn/T/Task9-codex-conversation-j9py6w`. Full provenance,
task/thread bindings, raw log references, limitations and review reports remain in
`/private/tmp/codex-conversation-defaults/defaults-reviewed-checkpoint.json` and
`/private/tmp/codex-conversation-defaults/task-4-logs/`. Root hierarchy/reference/
identity, scaffold documentation and whitespace results are recorded separately
in `/private/tmp/codex-conversation-defaults/final-gates.json` after synchronization.
The old parallel broker fixture port collision and Vite chunk advisory are
retained limitations; no passing parallel broker-suite claim is made.

Publication: pending

Packaged-stack verification: pending

Live provider verification: pending

The composed gate uses jsdom, a synthetic room socket, actual conversation HTTP
and storage, and a fake native executable. It does not establish packaged Compose,
real browser/Keycloak, provider, architecture-minimum or new-image acceptance.
Task 9 and milestone aggregate gates remain open. Specification/memory-guided
working directories remain the separately scoped future extension.

## Defaults-discovery amendment status — 2026-10-07

The approved amendment and F1 correction were implemented and independently
reviewed on the local UI candidate branch `codex-defaults-ui` at
`79e5e7310a450efea561548cd87871446c1939aa`. The reviewed composed synthetic
candidate passed the mixed-capability defaults/lifecycle matrix; the workspace
UI default branch retains its prior runtime. Candidate contract publication,
packaged-stack verification, and authorized live-provider evidence remain
pending. See the [coordinated checkpoint](https://github.com/thoughtkhoral/thought-khoral/blob/main/.ai/specs/how/codex-room-conversations-implementation-plan.md).
