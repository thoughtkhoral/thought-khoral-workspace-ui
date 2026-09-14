# ThoughtKhoral workspace UI

`thought-khoral-workspace-ui` is the React/Vite browser workspace for governed
ThoughtKhoral rooms. It renders chat, active context, and human Confirm/Edit/
Dismiss controls for draft decisions.

## Status

MVP / active development.

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

See the [local specification index](.ai/specs/README.md) and the
[repository map](https://github.com/thoughtkhoral/thought-khoral/blob/main/docs/repository-map.md).

## Contributing

Start with an issue in this repository. UI changes must reference the accepted
issue, governing specification, and verification command. See the
[organization contribution guide](https://github.com/thoughtkhoral/.github/blob/main/CONTRIBUTING.md).
