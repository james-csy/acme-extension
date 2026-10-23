// Shared namespace for the extension's scripts. Chrome loads content scripts as plain scripts
// in manifest order (no import/export), so each file adds its parts to CN.
globalThis.CN = globalThis.CN || {};

CN.log = (...args) => console.log('[Connect Note]', ...args);

// An element's shadow root, including closed ones (element.shadowRoot is null for those, but
// extensions can open them). Chrome's openOrClosedShadowRoot throws on anything but an HTML
// element, such as the SVG icons all over LinkedIn, so those are skipped.
CN.shadowRootOf = (element) =>
  element.shadowRoot ||
  (element.namespaceURI === 'http://www.w3.org/1999/xhtml' && chrome.dom?.openOrClosedShadowRoot?.(element)) ||
  null;

// Each adapter describes one LinkedIn box: where it appears, how to find it, who it's for
CN.adapters = [];
CN.registerAdapter = (adapter) => CN.adapters.push(adapter);
