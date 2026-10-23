// The template panel: docked on the right on pages with a pick-from-list box (LinkedIn messaging).
// Clicking a template inserts it at the cursor in the message box you last typed in.
// It lives in a closed shadow root so LinkedIn's styles and ours can't affect each other.
(() => {
  if (window !== window.top) return; // one panel per tab, in the main page

  const STATE_KEY = 'panelState';
  const CONTEXT_REFRESH_MS = 1000;

  let host = null;
  let shadow = null;
  let els = {};
  let adapter = null;
  let templates = [];
  let state = { collapsed: false, top: 96 };
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
    .tab {
      display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 18px;
      background: var(--accent); color: #fff; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,.18);
    }
    .wrap.dark .tab { color: #0b1a29; }
  `;

  function isDarkPage() {
    const scheme = document.body?.dataset.colorScheme;
    return scheme ? scheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // 16px outline icons, drawn in the current text colour
  const ICONS = {
    edit: '<path d="M10.8 2.7l2.5 2.5-7.6 7.6-3.2.7.7-3.2 7.6-7.6Z"/><path d="M9.3 4.2l2.5 2.5"/>',
    minimize: '<path d="M3.5 8h9"/>',
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
    Object.assign(host.style, { position: 'fixed', right: '16px', zIndex: '2147483000' });
    shadow = host.attachShadow({ mode: 'closed' });
    shadow.append(el('style', { textContent: STYLE }));

    els.wrap = el('div', { className: `wrap${isDarkPage() ? ' dark' : ''}` });
    els.tab = el('button', { className: 'tab', type: 'button', textContent: 'Templates', title: 'Show message templates' });
    els.tab.addEventListener('click', () => setCollapsed(false));

    els.title = el('h2');
    const collapse = iconButton('minimize', 'Collapse panel', () => setCollapsed(true));
    const settings = iconButton('edit', 'Edit templates', openEditor);
    els.head = el('div', { className: 'head' }, els.title, settings, collapse);
    enableDragging(els.head);

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
  }

  function applyState() {
    host.style.top = `${state.top}px`;
    els.tab.hidden = !state.collapsed;
    els.panel.hidden = state.collapsed;
    els.panel.style.display = state.collapsed ? 'none' : '';
    els.tab.style.display = state.collapsed ? '' : 'none';
  }

  function saveState() {
    chrome.storage.local.set({ [STATE_KEY]: state });
  }

  function setCollapsed(collapsed) {
    state.collapsed = collapsed;
    applyState();
    saveState();
  }

  // Drag the header to move the panel up or down
  function enableDragging(handle) {
    handle.addEventListener('mousedown', (event) => {
      if (event.target.closest('button')) return;
      event.preventDefault();
      const startY = event.clientY;
      const startTop = state.top;
      const move = (e) => {
        state.top = Math.max(8, Math.min(window.innerHeight - 80, startTop + e.clientY - startY));
        host.style.top = `${state.top}px`;
      };
      const stop = () => {
        removeEventListener('mousemove', move);
        removeEventListener('mouseup', stop);
        saveState();
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

  // Who the message is for, refreshed when the target box changes (and at most once a second)
  async function refreshContext(force = false) {
    const box = CN.targetBox();
    if (!force && box === contextBox && Date.now() - contextCheckedAt < CONTEXT_REFRESH_MS) return;
    const boxChanged = box !== contextBox;
    contextBox = box;
    contextCheckedAt = Date.now();
    // No variables for this type means nothing about the recipient is used or shown
    if (!CN.TEMPLATE_TYPES[adapter.type].variables.length) {
      if (boxChanged) render();
      return;
    }
    const next = await adapter.getContext(box);
    if (JSON.stringify(next) === JSON.stringify(context) && !force) return;
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
      state = { ...state, ...(await chrome.storage.local.get(STATE_KEY))[STATE_KEY] };
      build();
      await loadTemplates();
      starting = false;
    } else if (host && active !== adapter) {
      adapter = active;
      await loadTemplates();
    }
    if (host) refreshContext();
  }

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'sync' && host) loadTemplates();
  });

  // `root` is for the test page, which can't otherwise see inside the closed shadow root
  CN.panel = { update, get root() { return shadow; } };
})();
