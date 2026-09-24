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
