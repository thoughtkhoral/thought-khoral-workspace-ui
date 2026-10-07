# ThoughtKhoral workspace UI specifications

Parent requirements in the ThoughtKhoral root `.ai/specs/` apply here. This project may diverge only through an accepted local decision record that identifies the overridden parent rule and its consequences.

See the [root specification index](https://github.com/thoughtkhoral/thought-khoral/blob/main/.ai/specs/README.md).

## Local areas

- [What: MVP workspace UI](what/mvp-ui.md)
- [What: public documentation](what/public-documentation.md)
- [How: implementation](how/implementation.md)
- [Decisions](decisions/README.md)
- [Decision 002: ThoughtKhoral project identity](decisions/002-thoughtkhoral-identity.md)

## Room lifecycle ownership

The UI owns the unjoined/joined presentation and explicit Enter/Leave
controls. The platform owns the host bootstrap and non-secret room URL binding;
the gateway remains an unchanged retained-v1 compatibility boundary with no
`room.leave` RPC. See the corresponding [platform lifecycle
specification](https://github.com/thoughtkhoral/thought-khoral-platform/blob/main/.ai/specs/what/local-mvp.md)
and [gateway specification](https://github.com/thoughtkhoral/thought-khoral-room-gateway/blob/main/.ai/specs/what/mvp-room.md).

## Approved Codex room-participation extension

- [What: codex room participation](what/codex-room-participation.md)
- [How: codex room participation](how/codex-room-participation.md)
- [Coordinated implementation plan](https://github.com/thoughtkhoral/thought-khoral/blob/main/.ai/specs/how/codex-room-conversations-implementation-plan.md)

Approved by the maintainer on 2026-10-05 under [issue 1](https://github.com/thoughtkhoral/thought-khoral-workspace-ui/issues/1).
Implementation follows the coordinated plan and its artifact/dependency gates.
Existing runtime behavior is unchanged until the relevant tasks pass verification.

Task 7 is independently reviewed and committed locally at `e4afe0562306d7996f1ed232bc7499ee64d6bc1c` on
`codex-room-conversation-ui`; the original checkout retains its prior runtime.
The [local checkpoint](how/codex-room-participation.md) records provider-free UI
verification. Opt-in activation and full-stack evidence remain Tasks 8–9.

## Task 9 synthetic verification and correction checkpoint — 2026-10-07

Local corrections and synthetic evidence are recorded in the [owning checkpoint](how/codex-room-participation.md). The approved defaults amendment and its correction for UI finding F1 are
accepted on reviewed local synthetic candidate branches. Contract publication, packaged-stack and separately authorized provider/live evidence remain pending. Original runtime is retained; local corrected branches are unmerged.

## Approved defaults-discovery amendment — 2026-10-07

The [approved design](https://github.com/thoughtkhoral/thought-khoral-codex-agent/blob/main/.ai/specs/how/default-settings-discovery-proposal.md) authorizes local defaults discovery and
independent optional controls, with verified unreleased candidate contract pins.
Implementation and synthetic verification follow the amendment plan; publication,
provider use, activation, merge and push retain their separate gates.

## Local main integration checkpoint — 2026-10-07

After explicit user authorization, the reviewed UI source at
`79e5e7310a450efea561548cd87871446c1939aa` was merged into local `main`.
Candidate and published fixture pins remain distinct; the v1.1 candidate is not
published. Verification is recorded in the owning How. Provider use, service
activation, publication, and push remain separate gates.

## Current POC publication checkpoint — 2026-10-07

The reviewed Codex room participation UI and defaults integration is pushed to
GitHub `main` at `0c8b599616a94d7dc73b335fb704407e15bbb9cc`. The provider-free UI
suite passed with one intentional composed-test skip. Packaged-stack and
separately authorized live verification remain open; this experimental POC is
not claimed production-ready.
