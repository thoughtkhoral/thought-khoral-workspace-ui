# Workspace UI implementation

Follow the [root N:N MVP foundation implementation plan](../../../../.ai/specs/how/n2n-mvp-foundation-implementation-plan.md) and the root governance decision before changing this project.

Implementation begins only after the relevant task is approved. The UI renders normalized gateway events and preserves the server-enforced human approval boundary in its controls.

## Approved implementation stack

The MVP pins exact direct dependency versions so installs are reproducible. Metadata was checked against the authoritative npm registry on 2026-09-11 before implementation. This repository's Node.js 25.5.0 satisfies every selected tool's engine range.

| Package | Version | License | Compatibility evidence |
| --- | --- | --- | --- |
| [`vite`](https://registry.npmjs.org/vite/8.3.0) | 8.3.0 | MIT | Requires Node `^20.19.0 || >=22.12.0`; Vitest 4.1 supports Vite 6-8. |
| [`@vitejs/plugin-react`](https://registry.npmjs.org/@vitejs%2fplugin-react/6.1.1) | 6.1.1 | MIT | Requires Node `^20.19.0 || >=22.12.0` and Vite `^8.0.0`. |
| [`typescript`](https://registry.npmjs.org/typescript/5.9.3) | 5.9.3 | Apache-2.0 | Requires Node `>=14.17`; used for the Vite and React source build. |
| [`react`](https://registry.npmjs.org/react/19.3.0) | 19.3.0 | MIT | Satisfies PatternFly React's React 17-19 range and ChatBot's React 18-19 range. |
| [`react-dom`](https://registry.npmjs.org/react-dom/19.3.0) | 19.3.0 | MIT | Requires React `^19.3.0`, matching the pinned React version. |
| [`@patternfly/react-core`](https://registry.npmjs.org/@patternfly%2freact-core/6.6.1) | 6.6.1 | MIT | Supports React and React DOM `^17 || ^18 || ^19`; supplies the Page, Drawer, Alert, form, and decision-card controls. |
| [`@patternfly/chatbot`](https://registry.npmjs.org/@patternfly%2fchatbot/6.7.1) | 6.7.1 | MIT | Supports React and React DOM `^18 || ^19` and depends on PatternFly `^6.6.0`; supplies the normalized-event chat stream. |
| [`monaco-editor`](https://registry.npmjs.org/monaco-editor/0.54.0) | 0.54.0 | MIT | Required ChatBot peer; exactly matches the minimum in ChatBot's pre-1.0 `^0.54.0` range. |
| [`@monaco-editor/react`](https://registry.npmjs.org/@monaco-editor%2freact/4.7.0) | 4.7.0 | MIT | Required ChatBot peer; accepts React 16.8-19 and Monaco `>=0.25.0 <1`. |
| [`dompurify`](https://registry.npmjs.org/dompurify/3.4.13) | 3.4.13 | MPL-2.0 OR Apache-2.0 | Security override for Monaco's exact vulnerable transitive 3.1.7 dependency; it preserves DOMPurify's public 3.x API. |
| [`vitest`](https://registry.npmjs.org/vitest/4.1.11) | 4.1.11 | MIT | Requires Node `^20 || ^22 || >=24` and supports Vite 6, 7, or 8. This patch includes the redirect-mock path-traversal fix identified during dependency audit. |
| [`jsdom`](https://registry.npmjs.org/jsdom/27.4.0) | 27.4.0 | MIT | Requires Node `^20.19 || ^22.12 || >=24`; provides the Vitest DOM environment. Its `canvas` peer is optional. |
| [`@testing-library/react`](https://registry.npmjs.org/@testing-library%2freact/16.3.3) | 16.3.3 | MIT | Supports React and React DOM 18 or 19 and Testing Library DOM `^10`. |
| [`@testing-library/dom`](https://registry.npmjs.org/@testing-library%2fdom/10.4.1) | 10.4.1 | MIT | Requires Node `>=18`; satisfies React Testing Library and user-event. |
| [`@testing-library/user-event`](https://registry.npmjs.org/@testing-library%2fuser-event/14.6.7) | 14.6.7 | MIT | Requires Node `>=12` and Testing Library DOM `>=7.21.4`. |
| [`@types/react`](https://registry.npmjs.org/@types%2freact/19.3.0) / [`@types/react-dom`](https://registry.npmjs.org/@types%2freact-dom/19.3.0) | 19.3.0 | MIT | Type declarations match React 19.3.0; React DOM types require React types `^19.3.0`. |

PatternFly base CSS is imported before the app and ChatBot CSS is imported last, as required by their package installation guidance. Browser execution targets modern browsers supported by Vite 8 and PatternFly 6. The lockfile is the source of truth for transitive package versions and license review after installation.

## Production ChatBot module contract

The production preview must execute and render the normalized-event ChatBot stream, not merely compile it. A regression in the initial Task 5 build produced a blank page at the static preview URL and `TypeError: d is not a function` while initializing the generated `ChatStream` asset. The generated call crossed a manually configured Rolldown chunk boundary; it did not originate in room data or decision state.

The installed `@patternfly/chatbot` 6.7.1 package is authoritative for the supported API. Its `dist/dynamic/Chatbot` entry exposes the Chatbot component as the default export and `ChatbotDisplayMode` as a named runtime export, while the component-specific dynamic entries expose `ChatbotContent`, `ChatbotFooter`, `Message`, `MessageBar`, and `MessageBox` as defaults. The package's installed examples use those same dynamic imports and `ChatbotDisplayMode.embedded`. The UI will retain that supported API and let Vite manage the interdependent ChatBot and markdown module graph instead of forcing those internals into custom code-splitting groups.

A static-preview smoke check must build the application, install a host bootstrap value, load the emitted Vite application entry in a browser-like DOM, follow its lazy import, and wait for a visible `Room conversation`. A focused source component test remains useful, but it does not substitute for this entry-to-lazy-chunk production path. Together these checks guard production module initialization and component rendering that the original source-only decision tests could not cover.

## Authenticated browser transport boundary

`RoomPage` accepts `getAccessToken` and an authenticated `createSocket(url, accessToken)` adapter from its OIDC-enabled host. The hook acquires a fresh token before each connection attempt and never persists, logs, renders, or places it in a URL. A native browser `WebSocket` cannot set an `Authorization` header, so the host adapter and deployment edge must establish the gateway-compatible authenticated upgrade (for example through a same-origin session or a narrowly scoped WebSocket ticket). Task 8 must exercise that adapter against the live gateway; the UI does not invent an incompatible query-token convention.
