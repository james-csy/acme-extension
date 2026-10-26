// The template panel, on pages with a pick-from-list box (LinkedIn messaging). It sits beside the
// chat in use and follows it; dragged somewhere else, it stays there until it's put back or another
// chat is used. Clicking a template inserts it at the cursor in the message box you last typed in.
// It lives in a closed shadow root so LinkedIn's styles and ours can't affect each other.
(() => {
  if (window !== window.top) return; // one panel per tab, in the main page

  const STATE_KEY = 'panelState';
  const CONTEXT_REFRESH_MS = 1000;
  const GAP = 12; // between the panel and the message box
  const MARGIN = 8; // kept from the window's edges

  let host = null;
  let shadow = null;
  let els = {};
  let adapter = null;
  let templates = [];
  // `pos` is where the panel was dragged to ({ left, top }), or null to sit beside the chat. A drag
  // lasts while that chat is in use: going to another chat, or reloading, puts it back beside one.
  let state = { collapsed: false, pos: null };
  let context = {};
  let contextBox = null;
  let contextCheckedAt = 0;
  let statusTimer = null;

  CN.isPanelNode = (node) => Boolean(shadow) && node.getRootNode() === shadow;

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .wrap {
      --bg: #fff; --text: #1d1d1f; --muted: #5e5e5e; --border: #d9d6d0; --hover: #f3f2ef;
      --accent: #0a66c2; --accent-bg: #e8f1fb; --danger: #b42318;
      font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: var(--text);
    }
    .wrap.dark {
      --bg: #1b1f23; --text: #e8e8e8; --muted: #a8a8a8; --border: #3d434a; --hover: #2b3137;
      --accent: #71b7fb; --accent-bg: #1d3247; --danger: #f97066;
    }
    .panel {
      width: 288px; max-height: min(560px, calc(100vh - 32px)); display: flex; flex-direction: column;
      background: var(--bg); border: 1px solid var(--border); border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.08); overflow: hidden;
    }
    .head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--border); cursor: grab; user-select: none; }
    .head:active { cursor: grabbing; }
    .head h2 { flex: 1; margin: 0; font-size: 14px; font-weight: 600; }
    button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; }
    .icon { width: 28px; height: 28px; border-radius: 6px; color: var(--muted); display: inline-flex; align-items: center; justify-content: center; }
    .icon:hover, .icon:focus-visible { background: var(--hover); color: var(--text); }
    .svg { display: inline-flex; }
    button:focus-visible, .item:focus-visible, .search input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .search { margin: 10px 12px 6px; }
    .search input {
      width: 100%; font: inherit; color: inherit; background: var(--bg); padding: 6px 10px;
      border: 1px solid var(--border); border-radius: 16px; outline: none;
    }
    .search input:focus { border-color: var(--accent); }
    .to { margin: 0 12px 6px; font-size: 12px; color: var(--muted); }
    .to b { color: var(--text); font-weight: 600; }
    .company { display: flex; align-items: center; gap: 8px; margin: 0 12px 8px; font-size: 12px; color: var(--muted); }
    .company input {
      flex: 1; min-width: 0; font: inherit; color: var(--text); background: var(--bg); padding: 4px 8px;
      border: 1px solid var(--border); border-radius: 6px; outline: none;
    }
    .company input:focus { border-color: var(--accent); }
    .list { overflow-y: auto; padding: 0 6px 6px; }
    .item { display: flex; align-items: flex-start; gap: 6px; width: 100%; padding: 8px; border-radius: 8px; text-align: left; cursor: pointer; }
    .item:hover, .item:focus-visible { background: var(--hover); }
    .insert { flex: none; align-self: center; font-size: 12px; font-weight: 600; color: var(--accent); opacity: 0; }
    .item:hover .insert, .item:focus-visible .insert { opacity: 1; }
    .item .text { flex: 1; min-width: 0; }
    .item .title { font-weight: 600; display: block; }
    .item .preview {
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      color: var(--muted); font-size: 12px; margin-top: 2px; white-space: pre-line;
    }
    .copy { flex: none; }
    .item .warn { display: block; margin-top: 2px; font-size: 11px; color: var(--danger); }
    .empty { padding: 16px 12px; color: var(--muted); text-align: center; }
    .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--border); }
    .link { color: var(--accent); font-weight: 600; }
    .status { font-size: 12px; color: var(--muted); min-height: 16px; flex: 1; text-align: right; }
    .status.warn { color: var(--danger); }
    /* Minimized: the panel's card shrunk to its icon, in the accent colour so it stands out on the page */
    .tab {
      display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0;
      background: var(--accent); color: var(--bg); border: none; border-radius: 12px;
      box-shadow: 0 6px 18px rgba(10,102,194,.35), 0 2px 6px rgba(0,0,0,.15);
      transition: filter .15s, transform .15s, box-shadow .15s;
    }
    .tab:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 10px 24px rgba(10,102,194,.4), 0 2px 6px rgba(0,0,0,.15); }
    .tab .svg svg { width: 20px; height: 20px; stroke-width: 1.5; }
    /* A newer version: a dot on the minimized button, a strip under the header */
    .tab { position: relative; }
    .tab.has-update::after {
      content: ""; position: absolute; top: -3px; right: -3px; width: 10px; height: 10px; border-radius: 50%;
      background: #e8590c; border: 2px solid var(--bg);
    }
    .notice {
      display: flex; align-items: center; gap: 8px; margin: 10px 12px 0; padding: 7px 8px 7px 10px;
      background: var(--accent-bg); border-radius: 8px; font-size: 12px;
    }
    .notice span { flex: 1; }
    .notice button { padding: 3px 10px; border-radius: 12px; background: var(--accent); color: var(--bg); font-weight: 600; font-size: 12px; }
  `;

  function isDarkPage() {
    const scheme = document.body?.dataset.colorScheme;
    return scheme ? scheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // 16px outline icons, drawn in the current text colour
  const ICONS = {
    edit: '<path d="M10.8 2.7l2.5 2.5-7.6 7.6-3.2.7.7-3.2 7.6-7.6Z"/><path d="M9.3 4.2l2.5 2.5"/>',
    minimize: '<path d="M3.5 8h9"/>',
    attach: '<path d="M8 2.5v7M5 6.5l3 3 3-3"/><path d="M3 13h10"/>',
    chat: '<path d="M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H7.2L4.5 13.3V11h-1a1 1 0 0 1-1-1Z"/><path d="M5.2 5.6h5.6M5.2 8h3.6"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5"/>',
  };
  function icon(name) {
    const span = document.createElement('span');
    span.className = 'svg';
    span.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
    return span;
  }
  function iconButton(name, label, onClick) {
    const button = el('button', { className: 'icon', type: 'button', title: label });
    button.setAttribute('aria-label', label);
    button.append(icon(name));
    if (onClick) button.addEventListener('click', onClick);
    return button;
  }

  function el(tag, props = {}, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  }

  // ---- Building and showing --------------------------------------------

  function build() {
    host = document.createElement('connect-note-panel');
    Object.assign(host.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483000', transition: 'none' });
    shadow = host.attachShadow({ mode: 'closed' });
    shadow.append(el('style', { textContent: STYLE }));

    els.wrap = el('div', { className: `wrap${isDarkPage() ? ' dark' : ''}` });
    // Minimized: a chat-bubble button beside the message box; click to open, drag to move
    els.tab = iconButton('chat', 'Show message templates', () => setCollapsed(false));
    els.tab.className = 'tab';
    enableDragging(els.tab);

    els.title = el('h2');
    const collapse = iconButton('minimize', 'Collapse panel', () => setCollapsed(true));
    const settings = iconButton('edit', 'Edit templates', openEditor);
    els.attach = iconButton('attach', 'Put back next to the message box', () => {
      state.pos = null;
      applyState();
      saveState();
    });
    els.head = el('div', { className: 'head' }, els.title, els.attach, settings, collapse);
    enableDragging(els.head);

    els.notice = el('div', { className: 'notice', hidden: true });

    els.search = el('input', { type: 'search', placeholder: 'Filter templates' });
    els.search.setAttribute('aria-label', 'Filter templates');
    els.search.addEventListener('input', render);
    els.to = el('p', { className: 'to' });
    // Their company, when it's been remembered; typing it here remembers it for next time
    els.company = el('input', { type: 'text', placeholder: 'Not known yet, type it to use it' });
    els.company.setAttribute('aria-label', "Recipient's company");
    els.company.addEventListener('input', () => {
      context = { ...context, company: els.company.value.trim() || null };
      CN.rememberPerson({ ids: context.ids, fullName: context.fullName, company: context.company, title: context.title });
      renderList();
    });
    els.companyRow = el('label', { className: 'company' }, 'Company', els.company);
    els.list = el('div', { className: 'list' });
    const create = el('button', { className: 'link', type: 'button', textContent: '+ New template' });
    create.addEventListener('click', openEditor);
    els.status = el('span', { className: 'status', role: 'status' });

    els.panel = el(
      'div',
      { className: 'panel' },
      els.head,
      els.notice,
      el('div', { className: 'search' }, els.search),
      els.to,
      els.companyRow,
      els.list,
      el('div', { className: 'foot' }, create, els.status)
    );
    els.wrap.append(els.tab, els.panel);
    shadow.append(els.wrap);
    document.documentElement.append(host);
    applyState();
    // Show what's known about updates, and check the folder now (the answer arrives as a change
    // to `notice`, below)
    chrome.storage.local.get('notice').then(({ notice }) => showNotice(notice));
    chrome.runtime.sendMessage({ type: 'check-update' }).catch(() => {});
  }

  // A newer version (see background.js): ready in the folder of an auto-updated install, with a
  // button that loads it and refreshes this page; or on GitHub, with a link to how to update
  const HOW_TO_UPDATE = 'https://github.com/james-csy/acme-extension#updating';
  function showNotice(notice) {
    if (!host) return;
    els.notice.hidden = !notice;
    els.tab.classList.toggle('has-update', Boolean(notice));
    els.tab.title = notice ? `Show message templates (update: v${notice.version})` : 'Show message templates';
    if (!notice) return;
    const ready = notice.kind === 'ready';
    const action = el('button', {
      type: 'button',
      textContent: ready ? 'Update' : 'How to update',
      title: ready ? 'Loads the new version and refreshes this page' : 'Opens the update steps on GitHub',
    });
    action.addEventListener('click', () => {
      if (ready) chrome.runtime.sendMessage({ type: 'apply-update' });
      else open(HOW_TO_UPDATE, '_blank', 'noopener');
    });
    els.notice.replaceChildren(
      el('span', { textContent: ready ? `Update ready: v${notice.version}` : `v${notice.version} is available` }),
      action
    );
  }

  function applyState() {
    els.attach.hidden = !state.pos;
    els.tab.hidden = !state.collapsed;
    els.panel.hidden = state.collapsed;
    els.panel.style.display = state.collapsed ? 'none' : '';
    els.tab.style.display = state.collapsed ? '' : 'none';
    place();
  }

  // The box's position in the main page, also for a box inside a same-origin frame
  function boxRect(box) {
    const rect = box.getBoundingClientRect();
    const frame = box.ownerDocument.defaultView?.frameElement;
    if (!frame) return rect;
    const offset = frame.getBoundingClientRect();
    return { left: rect.left + offset.left, right: rect.right + offset.left, top: rect.top + offset.top, bottom: rect.bottom + offset.top };
  }

  // The chat the panel sits beside: the message box of the chat in use, kept until another chat's
  // message box takes over. Clicking into a comment or search box doesn't move it. Going to another
  // chat (clicking into it, opening it, or the old one closing) glides it over there. When the
  // chat's box is only hidden, e.g. while LinkedIn redraws it, another chat that happens to be the
  // only one on screen takes over only after a while.
  const HIDDEN_FOR_MS = 1500;
  let anchor = null;
  let anchorHiddenSince = 0;
  let placed = false;
  const isShown = (el) => Boolean(el?.isConnected && el.getClientRects().length);
  function updateAnchor(box) {
    anchorHiddenSince = isShown(anchor) ? 0 : anchorHiddenSince || Date.now();
    if (!box || box === anchor || !CN.messageBoxes().includes(box)) return;
    const picked = box === CN.chosenBox();
    if (!picked && anchor?.isConnected && (!anchorHiddenSince || Date.now() - anchorHiddenSince < HIDDEN_FOR_MS)) return;
    if (placed) glide();
    anchor = box;
    // Another chat: back beside it, wherever the panel was dragged to
    if (state.pos) {
      state.pos = null;
      els.attach.hidden = true;
    }
  }
  function glide() {
    host.style.transition = 'left .25s cubic-bezier(.2,.8,.2,1), top .25s cubic-bezier(.2,.8,.2,1)';
    clearTimeout(glide.timer);
    // 'none', not '': ends the glide even where it didn't run, e.g. in a background tab
    glide.timer = setTimeout(() => (host.style.transition = 'none'), 300);
  }

  // Where the panel was dragged to, else beside the chat's message box with their bottoms lined up: to
  // its right if there's room (on the messaging page, over the right-hand column), else to its
  // left (a pop-up chat in the corner), else just above it. With no chat on screen for now, it
  // stays where it is. Kept inside the window.
  function place() {
    if (!host) return;
    const { width, height } = host.getBoundingClientRect();
    let left = innerWidth - width - 16;
    let top = 96;
    let origin = 'top right';
    const box = isShown(anchor) ? boxRect(anchor) : null;
    if (placed && !state.pos && !box) {
      left = parseFloat(host.style.left);
      top = parseFloat(host.style.top);
      origin = els.panel.style.transformOrigin || origin;
    } else if (state.pos) {
      ({ left, top } = state.pos);
      origin = 'top left';
    } else if (box) {
      top = box.bottom - height;
      origin = 'bottom right';
      if (box.right + GAP + width <= innerWidth - MARGIN) {
        left = box.right + GAP;
        origin = 'bottom left';
      } else if (box.left - GAP - width >= MARGIN) left = box.left - GAP - width;
      else {
        left = box.right - width;
        top = box.top - GAP - height;
      }
    }
    els.panel.style.transformOrigin = els.tab.style.transformOrigin = origin;
    left = Math.max(MARGIN, Math.min(left, innerWidth - width - MARGIN));
    top = Math.max(MARGIN, Math.min(top, innerHeight - height - MARGIN));
    host.style.left = `${Math.round(left)}px`;
    host.style.top = `${Math.round(top)}px`;
    placed = true;
  }

  // The box moves when the page scrolls or the window is resized; follow it once per frame
  let placing = false;
  function schedulePlace() {
    if (placing || !host) return;
    placing = true;
    requestAnimationFrame(() => {
      placing = false;
      place();
    });
  }
  addEventListener('resize', schedulePlace);
  addEventListener('scroll', schedulePlace, true);

  // Only whether it's minimized is kept across pages
  function saveState() {
    chrome.storage.local.set({ [STATE_KEY]: { collapsed: state.collapsed } });
  }

  // Minimizing shrinks the panel into the corner the button then appears in (the one nearest the
  // message box), and opening grows it back out of there
  let switching = false;
  async function setCollapsed(collapsed) {
    if (switching || state.collapsed === collapsed) return;
    switching = true;
    const [from, to] = collapsed ? [els.panel, els.tab] : [els.tab, els.panel];
    await play(from, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `scale(${collapsed ? 0.92 : 0.8})` }],
      { duration: collapsed ? 140 : 90, easing: 'cubic-bezier(.4,0,1,1)' });
    state.collapsed = collapsed;
    applyState();
    saveState();
    await play(to, [{ opacity: 0, transform: `scale(${collapsed ? 0.8 : 0.92})` }, { opacity: 1, transform: 'none' }],
      { duration: collapsed ? 160 : 200, easing: 'cubic-bezier(.2,.8,.2,1)' });
    switching = false;
  }

  function play(node, keyframes, options) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    const animation = node.animate(keyframes, options);
    // A background tab may not run animations; don't wait on one forever
    return Promise.race([animation.finished, new Promise((resolve) => setTimeout(resolve, options.duration + 50))]).catch(() => {});
  }

  // Drag the header (or the minimized button) to move the panel anywhere; it then stays there
  // instead of following the box. A click without moving does what it normally does.
  function enableDragging(handle) {
    handle.addEventListener('mousedown', (event) => {
      if (event.target.closest('button') !== (handle.tagName === 'BUTTON' ? handle : null)) return;
      event.preventDefault();
      const start = host.getBoundingClientRect();
      const [startX, startY] = [event.clientX, event.clientY];
      let moved = false;
      const move = (e) => {
        if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return;
        moved = true;
        host.style.transition = 'none';
        state.pos = { left: start.left + e.clientX - startX, top: start.top + e.clientY - startY };
        els.attach.hidden = false;
        place();
      };
      const stop = () => {
        removeEventListener('mousemove', move);
        removeEventListener('mouseup', stop);
        if (!moved) return;
        saveState();
        // A drag that ends on the minimized button also clicks it; that click shouldn't open the panel
        const swallow = (e) => e.stopImmediatePropagation();
        handle.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => handle.removeEventListener('click', swallow, { capture: true }));
      };
      addEventListener('mousemove', move);
      addEventListener('mouseup', stop);
    });
  }

  function openEditor() {
    chrome.runtime.sendMessage({ type: 'open-options' });
  }

  function flash(message, warn = false) {
    els.status.textContent = message;
    els.status.className = `status${warn ? ' warn' : ''}`;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => (els.status.textContent = ''), warn ? 5000 : 2500);
  }

  // ---- Content ----------------------------------------------------------

  async function loadTemplates() {
    templates = (await CN.listTemplates()).filter((t) => t.type === adapter.type);
    render();
  }

  // Who the message is for, refreshed when the target box or the conversation (the address)
  // changes, and at most once a second otherwise
  let contextHref = null;
  async function refreshContext(force = false) {
    const box = CN.targetBox();
    const moved = location.href !== contextHref;
    if (!force && !moved && box === contextBox && Date.now() - contextCheckedAt < CONTEXT_REFRESH_MS) return;
    const boxChanged = box !== contextBox;
    contextBox = box;
    updateAnchor(box);
    contextHref = location.href;
    contextCheckedAt = Date.now();
    // No variables for this type means nothing about the recipient is used or shown
    if (!CN.TEMPLATE_TYPES[adapter.type].variables.length) {
      if (boxChanged) render();
      return;
    }
    const next = await adapter.getContext(box);
    if (JSON.stringify(next) === JSON.stringify(context) && !force && !boxChanged) return;
    context = next;
    render();
  }

  function render() {
    if (!host) return;
    els.title.textContent = `${CN.TEMPLATE_TYPES[adapter.type].label} templates`;
    // Recipient line only when the type fills in their details; otherwise just a hint until
    // there's a box to insert into
    const usesRecipient = CN.TEMPLATE_TYPES[adapter.type].variables.length > 0;
    els.to.replaceChildren(
      ...(!contextBox
        ? ['Click into the message box, then pick a template']
        : !usesRecipient
          ? []
          : context.fullName
            ? ['To: ', el('b', { textContent: context.fullName })]
            : ["Couldn't find the recipient's name, so {name} will be \"there\""])
    );
    els.to.hidden = !els.to.childNodes.length;
    // Only with a box to insert into, and someone or some conversation to remember it for
    const usesCompany = CN.TEMPLATE_TYPES[adapter.type].variables.some((v) => v.key === 'company');
    els.companyRow.hidden = !(usesCompany && contextBox && (context.ids?.length || context.fullName));
    // Don't overwrite what's being typed
    if (shadow.activeElement !== els.company) els.company.value = context.company || '';

    renderList();
  }

  function renderList() {
    const query = els.search.value.trim().toLowerCase();
    const shown = templates.filter((t) => !query || `${t.title} ${t.body}`.toLowerCase().includes(query));
    els.list.replaceChildren();
    if (!shown.length) {
      const empty = el('div', { className: 'empty' }, query ? 'No matches' : 'No message templates yet. ');
      if (!query) {
        const create = el('button', { className: 'link', type: 'button', textContent: 'Create one' });
        create.addEventListener('click', openEditor);
        empty.append(create);
      }
      els.list.append(empty);
      return;
    }
    for (const template of shown) els.list.append(renderItem(template));
  }

  function renderItem(template) {
    const filled = () => CN.fillForType(template.type, template.body, context);
    const copy = iconButton('copy', 'Copy to clipboard');
    copy.classList.add('copy');
    const text = el(
      'span',
      { className: 'text' },
      el('span', { className: 'title', textContent: template.title }),
      el('span', { className: 'preview', textContent: filled() })
    );
    // Flag variables this type can't fill (e.g. from an older template), which would be sent as typed
    const unsupported = CN.unsupportedVariables(template.type, template.body);
    if (unsupported.length) {
      const list = unsupported.map((k) => `{${k}}`).join(', ');
      text.append(el('span', { className: 'warn', textContent: `${list} won't be filled in` }));
    }
    const item = el(
      'div',
      { className: 'item', role: 'button', tabIndex: 0, title: 'Insert at your cursor in the message box' },
      text,
      el('span', { className: 'insert', textContent: 'Insert' }),
      copy
    );
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        insert(template);
      }
    });
    // Keep focus (and the cursor) in the message box while clicking the panel
    item.addEventListener('mousedown', (event) => event.preventDefault());
    item.addEventListener('click', async (event) => {
      if (copy.contains(event.target)) {
        await navigator.clipboard.writeText(filled());
        flash('Copied');
        return;
      }
      await insert(template);
    });
    return item;
  }

  async function insert(template) {
    const box = CN.targetBox();
    if (!box) return flash('Click into the message box first', true);
    await refreshContext(true);
    CN.insertText(box, CN.fillForType(template.type, template.body, context));
    CN.log(`[${adapter.id}] Inserted "${template.title}" for`, context.fullName || 'unknown recipient');
    flash('Inserted');
  }

  // ---- Lifecycle --------------------------------------------------------

  let starting = false;
  async function update() {
    const active = CN.adapters.find((a) => CN.TEMPLATE_TYPES[a.type].mode === 'picker' && a.matches()) || null;
    if (!active) {
      if (host) {
        host.remove();
        host = shadow = null;
        adapter = null;
      }
      return;
    }
    if (!host && !starting) {
      starting = true;
      adapter = active;
      state = { ...state, collapsed: Boolean((await chrome.storage.local.get(STATE_KEY))[STATE_KEY]?.collapsed), pos: null };
      build();
      await loadTemplates();
      starting = false;
    } else if (host && active !== adapter) {
      adapter = active;
      await loadTemplates();
    }
    if (host) await refreshContext();
    place();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && host) loadTemplates();
    if (area === 'local' && 'notice' in changes) showNotice(changes.notice.newValue);
  });

  // `root` is for the test page, which can't otherwise see inside the closed shadow root
  CN.panel = { update, get root() { return shadow; } };
})();
