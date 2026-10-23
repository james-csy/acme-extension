// Remembers the last text box the person clicked or typed in -- in the page, a closed shadow root
// or a same-origin frame -- so the panel knows where to insert a template.
(() => {
  let lastBox = null;

  // Only multi-line boxes a message is written in: textareas and rich-text editors. Single-line
  // inputs (like the "To" recipient search on a new message) and autocomplete boxes are skipped.
  function isTextBox(el) {
    if (!el || !(el.tagName === 'TEXTAREA' || el.isContentEditable)) return false;
    if (el.getAttribute('role') === 'combobox' || el.hasAttribute('aria-autocomplete')) return false;
    const label = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''}`;
    return !/search|recipient|type a name/i.test(label);
  }

  function onFocusIn(event) {
    // composedPath()[0] is the real target even inside a shadow root
    let target = event.composedPath()[0];
    if (!(target instanceof Element) || CN.isPanelNode?.(target)) return;
    // Inside a rich-text editor, focus can land on a child; use the editor itself
    while (target.parentElement?.isContentEditable) target = target.parentElement;
    if (isTextBox(target)) lastBox = target;
  }

  // A listener outside a closed shadow root only sees its host element as the target, so we
  // also listen inside the shadow roots we can open
  const watchedRoots = new WeakSet();
  function watchRoot(root) {
    if (watchedRoots.has(root)) return;
    watchedRoots.add(root);
    root.addEventListener('focusin', onFocusIn, true);
  }

  // Same-origin frames (like LinkedIn's /preload/) whose documents we can reach from here
  function frameDocuments() {
    return [...document.querySelectorAll('iframe')]
      .map((frame) => {
        try {
          return frame.contentDocument?.documentElement ? frame.contentDocument : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  // Called on every check: shadow roots and frames can appear at any time
  function trackFocus() {
    CN.searchRoots().forEach(watchRoot);
    frameDocuments().forEach(watchRoot);
  }

  // The focused element, followed down into shadow roots (open or closed) and same-origin frames.
  // Clicking the panel doesn't move focus, so this is still the message box being typed in.
  function deepActiveElement() {
    let active = document.activeElement;
    for (let depth = 0; active && depth < 10; depth += 1) {
      const shadow = CN.shadowRootOf(active);
      let inner = shadow?.activeElement;
      if (!inner && active.tagName === 'IFRAME') {
        try {
          inner = active.contentDocument?.activeElement;
        } catch {
          inner = null;
        }
      }
      if (!inner || inner === active) break;
      active = inner;
    }
    while (active?.parentElement?.isContentEditable) active = active.parentElement;
    return active;
  }

  // The box to insert into: the focused text box, else the last one used, else the page's
  // message box if there's exactly one obvious one
  function targetBox() {
    const focused = deepActiveElement();
    if (isTextBox(focused) && !CN.isPanelNode?.(focused)) return focused;
    if (lastBox?.isConnected) return lastBox;
    const roots = [...CN.searchRoots(), ...frameDocuments()];
    const candidates = roots
      .flatMap((root) => [...root.querySelectorAll('[contenteditable="true"], textarea')])
      // Outermost editors only, not the editable paragraphs inside them
      .filter((el) => isTextBox(el) && !el.parentElement?.isContentEditable);
    // "Write a message…" can be the box's label or placeholder, or a placeholder on its first line
    const hint = (el) =>
      ['aria-label', 'placeholder', 'aria-placeholder', 'data-placeholder']
        .flatMap((attr) => [el.getAttribute(attr), el.firstElementChild?.getAttribute(attr)])
        .join(' ');
    const messageBoxes = candidates.filter((el) => /message/i.test(hint(el)));
    return messageBoxes.length === 1 ? messageBoxes[0] : null;
  }

  Object.assign(CN, { trackFocus, targetBox });
})();
