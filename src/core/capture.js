// "Save this page for debugging": downloads the page as HTML including the parts a normal
// "Save page" misses -- LinkedIn's closed shadow roots and same-origin frames like /preload/.
// The file becomes a test fixture for writing new adapters.
(() => {
  // Every shadow root under a root, including closed ones and ones nested inside other shadow roots
  function collectShadowRoots(root, found = []) {
    for (const element of root.querySelectorAll('*')) {
      const shadow = CN.shadowRootOf(element);
      if (shadow) {
        found.push(shadow);
        collectShadowRoots(shadow, found);
      }
    }
    return found;
  }

  function serialize(doc) {
    const html = doc.documentElement;
    // getHTML writes the listed shadow roots out as <template shadowrootmode> (Chrome 125+)
    return html.getHTML
      ? `<!doctype html><html>${html.getHTML({ serializableShadowRoots: true, shadowRoots: collectShadowRoots(doc) })}</html>`
      : `<!doctype html>${html.outerHTML}`;
  }

  // Same-origin frames' documents are appended as inert templates so the page stays one file
  function serializeFrames(doc) {
    return [...doc.querySelectorAll('iframe')]
      .map((frame) => {
        try {
          const frameDoc = frame.contentDocument;
          if (!frameDoc?.documentElement) return '';
          const src = (frame.getAttribute('src') || '').replace(/"/g, '&quot;');
          return `\n<template data-captured-frame="${src}">${serialize(frameDoc)}</template>`;
        } catch {
          return ''; // cross-origin frame (ads etc.)
        }
      })
      .join('');
  }

  function capture() {
    const html = serialize(document).replace(/<\/html>$/, `${serializeFrames(document)}</html>`);
    const name = `linkedin-capture${location.pathname.replace(/[^\w]+/g, '-')}${Date.now()}.html`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    return name;
  }

  // Only the top frame answers, so one click gives one file
  if (window === window.top) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== 'capture-page') return;
      try {
        sendResponse({ ok: true, file: capture() });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
    });
  }
})();
