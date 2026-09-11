import { readdir } from 'node:fs/promises';

import { JSDOM } from 'jsdom';
import { build } from 'vite';

await build({ logLevel: 'silent' });

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'http://127.0.0.1:4173/' },
);

const { window } = dom;
Object.assign(globalThis, {
  document: window.document,
  Document: window.Document,
  Element: window.Element,
  Event: window.Event,
  EventTarget: window.EventTarget,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLLinkElement: window.HTMLLinkElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  MessageEvent: window.MessageEvent,
  MutationObserver: window.MutationObserver,
  Node: window.Node,
  self: window,
  SVGElement: window.SVGElement,
  window,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: window.navigator,
});

window.matchMedia ??= () => ({
  addEventListener() {},
  addListener() {},
  dispatchEvent: () => false,
  matches: false,
  media: '',
  onchange: null,
  removeEventListener() {},
  removeListener() {},
});
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
window.cancelAnimationFrame = clearTimeout;
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
globalThis.fetch = async () => new Response('', { status: 200 });
window.fetch = globalThis.fetch;
globalThis.ResizeObserver = class {
  disconnect() {}
  observe() {}
  unobserve() {}
};

const appendToHead = document.head.appendChild.bind(document.head);
document.head.appendChild = (node) => {
  const appended = appendToHead(node);
  if (node instanceof window.HTMLLinkElement) {
    queueMicrotask(() => node.dispatchEvent(new window.Event('load')));
  }
  return appended;
};

globalThis.WebSocket = class {
  static OPEN = 1;
};

class PreviewSocket extends window.EventTarget {
  readyState = 0;
  close() {}
  send() {}
}

window.n2nWorkspace = {
  roomId: 'room-preview-smoke',
  participantRole: 'human',
  getAccessToken: async () => 'preview-smoke-token',
  createSocket: () => new PreviewSocket(),
};

let runtimeError;
const captureRuntimeError = (reason) => {
  runtimeError = reason instanceof Error ? reason : new Error(String(reason));
  console.error(
    `Production ChatStream runtime error: ${runtimeError.name}: ${runtimeError.message}`,
  );
  process.exitCode = 1;
};
process.on('uncaughtException', captureRuntimeError);
process.on('unhandledRejection', captureRuntimeError);
window.addEventListener('error', (event) => captureRuntimeError(event.error));

const assetNames = await readdir(new URL('./dist/assets/', import.meta.url));
const entryAsset = assetNames.find(
  (assetName) => assetName.startsWith('index-') && assetName.endsWith('.js'),
);
if (!entryAsset) {
  throw new Error('The production build did not emit an application entry.');
}

try {
  await import(new URL(`./dist/assets/${entryAsset}`, import.meta.url));
} catch (error) {
  captureRuntimeError(error);
}

const deadline = Date.now() + 2_000;
let conversation;
while (!conversation && !runtimeError && Date.now() < deadline) {
  conversation = document.querySelector('[aria-label="Room conversation"]');
  if (!conversation) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const conversationStyle = conversation
  ? window.getComputedStyle(conversation)
  : undefined;
const isVisible =
  conversation &&
  !conversation.hidden &&
  conversation.getAttribute('aria-hidden') !== 'true' &&
  conversationStyle?.display !== 'none' &&
  conversationStyle?.visibility !== 'hidden';

if (!isVisible) {
  console.error('The production preview did not render a visible Room conversation.');
  console.error(`Preview DOM: ${document.body.innerHTML}`);
  process.exitCode = 1;
} else {
  console.log('Production preview rendered a visible Room conversation.');
}

dom.window.close();
