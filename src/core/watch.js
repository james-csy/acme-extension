// Watches LinkedIn for a box an adapter recognises, then fills it from that adapter's template.
(() => {
  const FILL_DELAY_MS = 150; // let the editor finish setting up before we fill it
  const KEEP_CHECK_MS = 600; // then check the page didn't redraw the box and drop the text
  const GIVE_UP_MS = 4000; // keep retrying this long when a fill doesn't take
  const POLL_MS = 500;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // The profile page lives in the top frame; read it from there when we're in the /preload/ iframe
  function pageDocument() {
    try {
      return window.top.document;
    } catch {
      return document;
    }
  }

  // Places a box can live: this document, plus LinkedIn's interop shadow root
  function searchRoots() {
    const roots = [document];
    const outlet = document.getElementById('interop-outlet');
    // The interop shadow root may be closed; extensions can still open it
    const shadow = outlet && CN.shadowRootOf(outlet);
    if (shadow) roots.push(shadow);
    report(roots, outlet ? `interop layer found, shadow root ${shadow ? 'readable' : 'not readable'}` : 'no interop layer');
    return roots;
  }

  // Logs what the extension can see, only when it changes, so the console isn't spammed
  let lastReport = '';
  function report(roots, status) {
    const boxes = roots.map((root) => root.querySelectorAll('[contenteditable="true"], textarea').length);
    const line = `${status}; editable boxes: ${boxes.join(' in page, ')}${boxes.length > 1 ? ' in shadow layer' : ' in page'}`;
    if (line === lastReport) return;
    lastReport = line;
    CN.log(line);
  }

  function findIn(root, selectors) {
    for (const selector of selectors) {
      const box = root.querySelector(selector);
      if (box) return box;
    }
    return null;
  }

  // One attempt: 'filled', 'skipped' (auto-fill off, no default, or the box has the person's own
  // text, so it's left alone), or 'failed' (worth trying again)
  async function fill(adapter, root, primaryBox) {
    const log = (...args) => CN.log(`[${adapter.id}]`, ...args);
    if (!(await CN.getSettings()).autoFill) return log('Auto-fill is off'), 'skipped';
    const template = await CN.defaultTemplate(adapter.type);
    const typeLabel = CN.TEMPLATE_TYPES[adapter.type].label;
    if (!template) return log(`No default ${typeLabel} template -- choose one in the extension popup`), 'skipped';
    const [primaryField] = adapter.fields;
    if (CN.currentText(primaryBox)) return log('Box already has text, leaving it alone'), 'skipped';
    log(`Using "${template.title}"`);

    const context = await adapter.getContext(pageDocument(), primaryBox);
    log('Context:', context);

    // The other fields (an InMail's message, after its subject) are looked for in the same dialog
    const scope = primaryBox.closest('[role="dialog"]') || root;
    for (const field of adapter.fields) {
      const box = field === primaryField ? primaryBox : findIn(scope, field.selectors);
      const text = template[field.key];
      if (!box || !text?.trim() || CN.currentText(box)) continue;
      CN.fillBox(box, CN.fillForType(adapter.type, text, context));
    }
    const filled = Boolean(CN.currentText(primaryBox));
    log(filled ? 'Filled' : 'Could not fill the box yet');
    return filled ? 'filled' : 'failed';
  }

  // Boxes being or already filled. One is forgotten once it's removed or hidden, so a box LinkedIn
  // reuses for the next invitation is filled again when it reappears.
  const handled = new Set();
  const isShown = (box) => box.isConnected && box.getClientRects().length > 0;
  function forgetClosedBoxes() {
    for (const box of handled) if (!isShown(box)) handled.delete(box);
  }

  // The editor can still be setting up when the box appears, or LinkedIn can redraw the dialog right
  // after and drop the text, so keep trying for a few seconds and check the text stayed. A box with
  // the person's own text in it is never touched.
  async function fillUntilItSticks(adapter, root, box) {
    const log = (...args) => CN.log(`[${adapter.id}]`, ...args);
    const started = Date.now();
    while (Date.now() - started < GIVE_UP_MS) {
      await wait(FILL_DELAY_MS);
      if (!chrome.runtime?.id || !handled.has(box) || !isShown(box)) return;
      let result;
      try {
        result = await fill(adapter, root, box);
      } catch (error) {
        log('Fill failed:', error);
        result = 'failed';
      }
      if (result === 'skipped') return;
      if (result === 'filled') {
        await wait(KEEP_CHECK_MS);
        if (!isShown(box) || CN.currentText(box)) return;
        log('The page cleared the text, filling again');
      }
    }
    log('Gave up: the box would not take the text');
  }

  const observedRoots = new WeakSet();
  const observers = [];
  function watch(root) {
    if (observedRoots.has(root)) return;
    observedRoots.add(root);
    const observer = new MutationObserver(check);
    observer.observe(root, { childList: true, subtree: true });
    observers.push(observer);
  }

  // After the extension is reloaded or updated, this copy keeps running in already-open tabs but
  // can no longer use Chrome's extension APIs. Shut it down quietly; a page refresh loads the new one.
  let timer = null;
  function stop() {
    clearInterval(timer);
    observers.forEach((observer) => observer.disconnect());
    document.querySelector('connect-note-panel')?.remove();
  }

  function check() {
    if (!chrome.runtime?.id) return stop();
    const roots = searchRoots();
    // The shadow root can appear after page load, so start watching it once it exists
    roots.forEach(watch);
    CN.trackFocus();
    // Shows the template panel on pages with a pick-from-list box, hides it elsewhere
    CN.panel?.update();
    // Remembers the company and title a profile or lead page shows, for messaging threads later
    CN.notePerson();

    // Auto-fill boxes only; pick-from-list boxes are filled from the panel.
    // Re-check matches() every time: LinkedIn changes pages without reloading
    forgetClosedBoxes();
    const autoAdapters = CN.adapters.filter((a) => CN.TEMPLATE_TYPES[a.type].mode === 'auto' && a.matches());
    for (const adapter of autoAdapters) {
      for (const root of roots) {
        // An adapter's first field is the one whose appearance means "the dialog is open"
        const box = findIn(root, adapter.fields[0].selectors);
        if (!box || handled.has(box) || !isShown(box)) continue;
        handled.add(box);
        CN.log(`[${adapter.id}] Box found`);
        fillUntilItSticks(adapter, root, box);
        return;
      }
    }
  }

  function start() {
    CN.log('Loaded on', location.pathname, window === window.top ? '(main page)' : '(inner frame)');
    for (const adapter of CN.adapters) adapter.setup?.();

    // Observers catch most changes instantly; the interval catches a shadow root created after
    // page load, whose contents no observer can see until we find it
    check();
    timer = setInterval(check, POLL_MS);
  }

  Object.assign(CN, { start, searchRoots, pageDocument });
})();
