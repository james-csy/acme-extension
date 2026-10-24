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
    noticeNewBoxes();
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

  const isShown = (el) => el.isConnected && el.getClientRects().length > 0;

  // The message boxes on screen ("Write a message…"): the messaging page's, and pop-up chats on
  // any page. Outermost editors only, not the editable paragraphs inside them.
  function messageBoxes() {
    // "Write a message…" can be the box's label or placeholder, or a placeholder on its first line
    const hint = (el) =>
      ['aria-label', 'placeholder', 'aria-placeholder', 'data-placeholder']
        .flatMap((attr) => [el.getAttribute(attr), el.firstElementChild?.getAttribute(attr)])
        .join(' ');
    return [...CN.searchRoots(), ...frameDocuments()]
      .flatMap((root) => [...root.querySelectorAll('[contenteditable="true"], textarea')])
      .filter((el) => isTextBox(el) && !el.parentElement?.isContentEditable && isShown(el) && /message/i.test(hint(el)));
  }

  // A message box that has just appeared on its own -- a chat opened with a profile's Message
  // button, or one expanded again -- becomes the box to insert into, as if it had been clicked.
  // (Several at once, as when a page loads, is left to targetBox's rules.)
  let shownBefore = new Set();
  function noticeNewBoxes() {
    const shown = messageBoxes();
    const appeared = shown.filter((box) => !shownBefore.has(box));
    if (appeared.length === 1) lastBox = appeared[0];
    shownBefore = new Set(shown);
  }

  // The box to insert into: the focused text box, else the last one used (or just opened) while
  // it's still on screen, else the page's message box found without a click. Switching chats can
  // swap in a new box, so the open conversation's box is found again: the only visible one, or
  // with pop-up chats open too, the one in the page's main conversation.
  function targetBox() {
    const focused = deepActiveElement();
    if (isTextBox(focused) && !CN.isPanelNode?.(focused)) return focused;
    if (lastBox && isShown(lastBox)) return lastBox;
    const boxes = messageBoxes();
    if (boxes.length === 1) return boxes[0];
    const inConversation = boxes.filter((el) => el.closest('main, .msg__detail, .scaffold-layout__detail'));
    return inConversation.length === 1 ? inConversation[0] : null;
  }

  Object.assign(CN, { trackFocus, targetBox, messageBoxes });
})();
