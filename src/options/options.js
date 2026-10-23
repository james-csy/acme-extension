// Template editor page: create, edit, organise, export and import templates.

// Example person for the preview and character count: only the variables the type can fill,
// so anything else shows exactly as it would be sent
const sampleContext = (typeKey) =>
  Object.fromEntries(CN.TEMPLATE_TYPES[typeKey].variables.map((v) => [v.key, v.example]));

// "connection note", but "InMail" keeps its capitals; with "a" or "an" in front
const lower = (label) => (label === 'InMail' ? label : label.toLowerCase());
const withArticle = (label) => `${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${lower(label)}`;

const $ = (id) => document.getElementById(id);
const els = {
  search: $('search'), groups: $('groups'), libraryStatus: $('library-status'),
  empty: $('empty'), form: $('form'), title: $('title'), type: $('type'),
  defaultField: $('default-field'), isDefault: $('is-default'), defaultHint: $('default-hint'),
  defaultLabel: $('default-label'), usageField: $('usage-field'), dirty: $('dirty'),
  subjectField: $('subject-field'), subject: $('subject'), body: $('body'), count: $('count'),
  chips: $('variable-chips'), variablesSection: $('variables-section'), warning: $('warning'),
  previewSubject: $('preview-subject'), previewBody: $('preview-body'),
  error: $('error'), status: $('status'), delete: $('delete'), duplicate: $('duplicate'),
};

let templates = [];
let settings = { defaults: {} };
let selectedId = null; // null while editing a new, unsaved template
let dirty = false;
let lastFocusedField = els.body;

// Unsaved changes are shown next to Save, and guard against leaving or switching template
function setDirty(value) {
  dirty = value;
  els.dirty.hidden = !value;
}

for (const [type, { label }] of Object.entries(CN.TEMPLATE_TYPES)) {
  els.type.append(new Option(label, type));
}

// The first template in sidebar order (grouped by type), for opening the page or after a delete
function firstTemplateId() {
  const order = Object.keys(CN.TEMPLATE_TYPES);
  return [...templates].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))[0]?.id;
}

async function load() {
  [templates, settings] = await Promise.all([CN.listTemplates(), CN.getSettings()]);
  renderList();
}

// ---- Sidebar ------------------------------------------------------------

function renderList() {
  const query = els.search.value.trim().toLowerCase();
  els.groups.replaceChildren();

  for (const [type, { label, mode }] of Object.entries(CN.TEMPLATE_TYPES)) {
    const group = document.createElement('section');
    const head = document.createElement('div');
    head.className = 'group-head';
    const heading = document.createElement('span');
    heading.className = 'group-name';
    heading.textContent = `${label}s`;
    const modeNote = document.createElement('span');
    modeNote.className = 'group-mode';
    modeNote.textContent = mode === 'auto' ? 'auto-fill' : 'pick from panel';
    heading.append(modeNote);
    const add = document.createElement('button');
    add.type = 'button';
    add.textContent = '+';
    add.setAttribute('aria-label', `New ${lower(label)}`);
    add.title = `New ${lower(label)}`;
    add.addEventListener('click', () => confirmDiscard() && startNew(type));
    head.append(heading, add);
    group.append(head);

    const items = templates.filter(
      (t) => t.type === type && (!query || `${t.title} ${t.subject || ''} ${t.body}`.toLowerCase().includes(query))
    );
    for (const t of items) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `item${t.id === selectedId ? ' selected' : ''}`;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = t.title;
      item.append(name);
      if (settings.defaults[type] === t.id) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'Default';
        item.append(badge);
      }
      item.addEventListener('click', () => confirmDiscard() && select(t.id));
      group.append(item);
    }
    if (!items.length) {
      const none = document.createElement('p');
      none.className = 'group-empty';
      none.textContent = query ? 'No matches' : 'None yet';
      group.append(none);
    }
    els.groups.append(group);
  }

  const showEmpty = !templates.length && selectedId === null && els.form.hidden;
  els.empty.hidden = !showEmpty;
}

// ---- Editor -------------------------------------------------------------

function showForm(template, { isNew }) {
  els.empty.hidden = true;
  els.form.hidden = false;
  els.title.value = template.title || '';
  els.type.value = template.type;
  els.subject.value = template.subject || '';
  els.body.value = template.body || '';
  els.isDefault.checked = isNew
    ? !settings.defaults[template.type] // the first template of a type becomes its default
    : settings.defaults[template.type] === template.id;
  els.delete.hidden = isNew;
  els.duplicate.hidden = isNew;
  els.error.textContent = '';
  els.status.textContent = '';
  setDirty(false);
  renderFormState();
}

function select(id) {
  selectedId = id;
  showForm(templates.find((t) => t.id === id), { isNew: false });
  renderList();
}

function startNew(type, base = {}) {
  selectedId = null;
  showForm({ title: '', subject: '', body: '', ...base, type }, { isNew: true });
  if (base.body) setDirty(true);
  renderList();
  els.title.focus();
}

// Shows the fields, hints, count and preview that fit the chosen type
function renderFormState() {
  const type = CN.TEMPLATE_TYPES[els.type.value];
  const hasSubject = type.fields.includes('subject');
  els.subjectField.hidden = !hasSubject;
  els.defaultField.hidden = type.mode !== 'auto';
  els.usageField.hidden = type.mode === 'auto';
  els.defaultLabel.textContent = `Use as the default ${lower(type.label)}`;
  els.defaultHint.textContent = `Filled in automatically when ${withArticle(type.label)} box opens.`;

  renderVariables(type);
  // Don't suggest a variable the type can't fill
  els.body.placeholder = type.variables.length ? "Hi {name}, I'd love to connect." : 'Thanks for connecting!';
  const texts = [hasSubject ? els.subject.value : '', els.body.value];
  els.warning.textContent =
    unsupportedMessage(type, CN.unsupportedVariables(els.type.value, ...texts)) ||
    fallbackMessage(CN.missingFallbacks(els.type.value, ...texts));

  const context = sampleContext(els.type.value);
  const body = CN.fillForType(els.type.value, els.body.value, context);
  const max = type.maxLength.body;
  els.count.textContent = max ? `${body.length}/${max}` : `${body.length} characters`;
  els.count.classList.toggle('over', Boolean(max && body.length > max));
  els.previewSubject.textContent = hasSubject ? CN.fillForType(els.type.value, els.subject.value, context) : '';
  els.previewBody.textContent = body || '—';
}

// The variables this type can fill, as insert buttons. Types with none show no variables section.
function renderVariables(type) {
  els.variablesSection.hidden = !type.variables.length;
  els.chips.replaceChildren(
    ...type.variables.map((v) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = `{${v.key}}`;
      chip.title = v.fallback
        ? `${v.label}, e.g. ${v.example}. Not every page shows it, so this inserts {${v.key}|${v.fallback}}: change "${v.fallback}" to what to say instead.`
        : `${v.label}, e.g. ${v.example}`;
      chip.addEventListener('click', () => insertVariable(v.fallback ? `{${v.key}|${v.fallback}}` : `{${v.key}}`));
      return chip;
    })
  );
}

function unsupportedMessage(type, keys) {
  if (!keys.length) return '';
  const list = keys.map((k) => `{${k}}`).join(', ');
  return `${list} can't be filled in for ${lower(type.label)}s and would be sent exactly as typed. Remove ${keys.length > 1 ? 'them' : 'it'} to save.`;
}

function fallbackMessage(variables) {
  if (!variables.length) return '';
  const examples = variables.map((v) => `{${v.key}|${v.fallback}}`).join(' or ');
  return `Not every LinkedIn page shows ${variables.map((v) => v.label.toLowerCase()).join(' or ')}, so say what to use instead, e.g. ${examples}.`;
}

function readForm() {
  const type = els.type.value;
  const fields = { title: els.title.value.trim(), type, body: els.body.value };
  if (CN.TEMPLATE_TYPES[type].fields.includes('subject')) fields.subject = els.subject.value;
  return fields;
}

function validate(fields) {
  const type = CN.TEMPLATE_TYPES[fields.type];
  if (!fields.title) return 'Add a title.';
  if (type.fields.includes('subject') && !fields.subject?.trim()) return 'Add a subject.';
  if (!fields.body.trim()) return 'Add a message.';
  const unsupported = CN.unsupportedVariables(fields.type, fields.subject || '', fields.body);
  if (unsupported.length) return unsupportedMessage(type, unsupported);
  const noFallback = CN.missingFallbacks(fields.type, fields.subject || '', fields.body);
  if (noFallback.length) return fallbackMessage(noFallback);
  const max = type.maxLength.body;
  if (max && CN.fillForType(fields.type, fields.body, sampleContext(fields.type)).length > max) {
    return `${type.label}s are limited to ${max} characters. Shorten the message.`;
  }
  return '';
}

async function save(event) {
  event.preventDefault();
  const fields = readForm();
  const problem = validate(fields);
  // The unsupported-variable message is already shown live as a warning; don't repeat it
  els.error.textContent = problem === els.warning.textContent ? '' : problem;
  if (problem) return;

  const saved = await CN.saveTemplate({ ...fields, id: selectedId || undefined });
  // Point this type's default at the template, or away from it, and clear any default it
  // held for a type it no longer is
  const makeDefault = CN.TEMPLATE_TYPES[saved.type].mode === 'auto' && els.isDefault.checked;
  await CN.saveSettings((current) => {
    const defaults = Object.fromEntries(
      Object.entries(current.defaults).filter(([type, id]) => id !== saved.id || type === saved.type)
    );
    if (makeDefault) defaults[saved.type] = saved.id;
    else if (defaults[saved.type] === saved.id) delete defaults[saved.type];
    return { defaults };
  });

  await load();
  select(saved.id);
  els.status.textContent = 'Saved';
}

async function remove() {
  const template = templates.find((t) => t.id === selectedId);
  if (!template || !confirm(`Delete "${template.title}"? This can't be undone.`)) return;
  await CN.deleteTemplate(template.id);
  selectedId = null;
  els.form.hidden = true;
  await load();
  if (templates.length) select(firstTemplateId());
}

function confirmDiscard() {
  return !dirty || confirm('Discard your unsaved changes?');
}

// Insert a variable at the cursor of the subject or message, whichever was used last
function insertVariable(text) {
  const field = lastFocusedField;
  const start = field.selectionStart ?? field.value.length;
  field.setRangeText(text, start, field.selectionEnd ?? start, 'end');
  field.focus();
  setDirty(true);
  renderFormState();
}

// ---- Export / import ----------------------------------------------------

async function exportLibrary() {
  const data = await CN.exportLibrary();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  link.download = `connect-note-templates-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  els.libraryStatus.textContent = `Exported ${data.templates.length} templates`;
}

async function importLibrary(file) {
  try {
    const { added, skipped } = await CN.importLibrary(JSON.parse(await file.text()));
    els.libraryStatus.textContent = `Imported ${added} templates${skipped ? `, skipped ${skipped} already here` : ''}`;
    await load();
    if (selectedId === null && templates.length && els.form.hidden) select(firstTemplateId());
  } catch (error) {
    els.libraryStatus.textContent = error instanceof SyntaxError ? "That file isn't valid JSON." : error.message;
  }
}

// ---- Wiring -------------------------------------------------------------

els.form.addEventListener('submit', save);
els.form.addEventListener('input', () => {
  setDirty(true);
  els.status.textContent = '';
  els.error.textContent = '';
  renderFormState();
});
els.type.addEventListener('change', () => {
  // Switching type: suggest it as default if that type has none yet
  if (selectedId === null || settings.defaults[els.type.value] !== selectedId) {
    els.isDefault.checked = !settings.defaults[els.type.value];
  }
  renderFormState();
});
els.subject.addEventListener('focus', () => (lastFocusedField = els.subject));
els.body.addEventListener('focus', () => (lastFocusedField = els.body));
els.delete.addEventListener('click', remove);
// The copy carries the current edits, so there's nothing to discard
els.duplicate.addEventListener('click', () => {
  const fields = readForm();
  startNew(fields.type, { ...fields, title: `${fields.title} (copy)` });
});
els.search.addEventListener('input', renderList);
$('export').addEventListener('click', exportLibrary);
$('import-file').addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (file) importLibrary(file);
  event.target.value = '';
});
document.querySelectorAll('[data-new]').forEach((button) =>
  button.addEventListener('click', () => startNew(button.dataset.new))
);
// ⌘S / Ctrl+S saves the open template
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && !els.form.hidden) {
    event.preventDefault();
    els.form.requestSubmit();
  }
});
window.addEventListener('beforeunload', (event) => {
  if (dirty) event.preventDefault();
});

// Keep the list current when the popup changes a default
chrome.storage.onChanged.addListener(async (_changes, area) => {
  if (area !== 'sync' || dirty) return;
  await load();
  if (selectedId && templates.some((t) => t.id === selectedId)) {
    els.isDefault.checked = settings.defaults[els.type.value] === selectedId;
  }
});

load().then(() => {
  if (templates.length) select(firstTemplateId());
  else renderList();
});
