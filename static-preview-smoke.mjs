import { readdir } from 'node:fs/promises';

import { JSDOM } from 'jsdom';
import { build } from 'vite';

await build({ logLevel: 'silent' });

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div><div id="preview-root"></div></body></html>',
  { url: 'http://127.0.0.1:4173/' },
);

const { window } = dom;
Object.assign(globalThis, {
  document: window.document,
  Element: window.Element,
  Event: window.Event,
  EventTarget: window.EventTarget,
  HTMLElement: window.HTMLElement,
  MessageEvent: window.MessageEvent,
  MutationObserver: window.MutationObserver,
  Node: window.Node,
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
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.fetch = async () => new Response('', { status: 200 });
window.fetch = globalThis.fetch;
globalThis.ResizeObserver = class {
  disconnect() {}
  observe() {}
  unobserve() {}
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
const chatStreamAsset = assetNames.find(
  (assetName) => assetName.startsWith('ChatStream-') && assetName.endsWith('.js'),
);

if (!chatStreamAsset) {
  throw new Error('The production build did not emit a ChatStream module.');
}

const entryAsset = assetNames.find(
  (assetName) => assetName.startsWith('index-') && assetName.endsWith('.js'),
);
if (!entryAsset) {
  throw new Error('The production build did not emit an application entry.');
}

let chatStreamModule;
try {
  chatStreamModule = await import(
    new URL(`./dist/assets/${chatStreamAsset}`, import.meta.url),
  );
} catch (error) {
  captureRuntimeError(error);
}

if (typeof chatStreamModule?.ChatStream !== 'function') {
  console.error('The production ChatStream module did not initialize.');
  process.exitCode = 1;
} else {
  console.log('Production ChatStream module initialized successfully.');
}

dom.window.close();
