// The template library, in chrome.storage.sync so it follows the person across their Chrome profiles:
//   'tpl:<id>'  -> { id, title, type, subject?, body, updatedAt }   one key per template (sync caps each item at 8 KB)
//   'settings'  -> { defaults: { connection_note: '<id>', inmail: '<id>' }, autoFill: true }
(() => {
  const PREFIX = 'tpl:';
  // Fixed id so two scripts migrating at the same moment can't create duplicates
  const MIGRATED_ID = 'tpl_connection_note';
  const DEFAULT_SETTINGS = { defaults: {}, autoFill: true };

  // v0.5 saved { templates: { 'connect-note': { body } } }; v0.4 and earlier saved { noteTemplate }
  async function migrate(all) {
    const body = all.templates?.['connect-note']?.body || all.noteTemplate;
    if (!body) return false;
    const template = { id: MIGRATED_ID, title: 'Connection note', type: 'connection_note', body, updatedAt: Date.now() };
    const settings = {
      ...DEFAULT_SETTINGS,
      ...all.settings,
      defaults: { connection_note: MIGRATED_ID, ...all.settings?.defaults },
    };
    await chrome.storage.sync.set({ [PREFIX + MIGRATED_ID]: template, settings });
    await chrome.storage.sync.remove(['templates', 'noteTemplate']);
    return true;
  }

  async function readAll() {
    const all = await chrome.storage.sync.get(null);
    return (await migrate(all)) ? chrome.storage.sync.get(null) : all;
  }

  async function listTemplates() {
    const all = await readAll();
    return Object.entries(all)
      .filter(([key]) => key.startsWith(PREFIX))
      .map(([, template]) => template)
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  async function getSettings() {
    const { settings } = await readAll();
    return { ...DEFAULT_SETTINGS, ...settings, defaults: { ...settings?.defaults } };
  }

  // Saves run one after another, each reading the latest settings, so two quick changes
  // (say a default and the auto-fill switch) can't overwrite each other.
  // `changes` is an object to merge, or a function from the current settings to one.
  let settingsQueue = Promise.resolve();
  function saveSettings(changes) {
    const run = async () => {
      const current = await getSettings();
      const settings = { ...current, ...(typeof changes === 'function' ? changes(current) : changes) };
      await chrome.storage.sync.set({ settings });
      return settings;
    };
    settingsQueue = settingsQueue.then(run, run);
    return settingsQueue;
  }

  async function saveTemplate(fields) {
    const template = { ...fields, id: fields.id || `tpl_${crypto.randomUUID().slice(0, 8)}`, updatedAt: Date.now() };
    await chrome.storage.sync.set({ [PREFIX + template.id]: template });
    return template;
  }

  async function deleteTemplate(id) {
    await chrome.storage.sync.remove(PREFIX + id);
    await saveSettings(({ defaults }) => ({
      defaults: Object.fromEntries(Object.entries(defaults).filter(([, defaultId]) => defaultId !== id)),
    }));
  }

  // The template an auto-fill box uses, or null when none is set
  async function defaultTemplate(type) {
    const [{ defaults }, templates] = await Promise.all([getSettings(), listTemplates()]);
    return templates.find((t) => t.id === defaults[type] && t.type === type) || null;
  }

  // Export/import is how people back up their library or hand a starter set to a teammate
  async function exportLibrary() {
    const [templates, { defaults }] = await Promise.all([listTemplates(), getSettings()]);
    return { format: 'connect-note-templates', version: 1, templates, defaults };
  }

  // Imported templates are added as copies; ones identical to an existing template are skipped.
  // Defaults are only taken for types that don't have one yet.
  async function importLibrary(data) {
    if (data?.format !== 'connect-note-templates' || !Array.isArray(data.templates)) {
      throw new Error("That file isn't a template export.");
    }
    const existing = await listTemplates();
    const sameAs = (a, b) => a.type === b.type && a.title === b.title && a.body === b.body && (a.subject || '') === (b.subject || '');
    const newIds = {};
    let added = 0;
    for (const t of data.templates) {
      if (!CN.TEMPLATE_TYPES[t.type] || typeof t.body !== 'string') continue;
      const match = existing.find((e) => sameAs(e, t));
      if (match) {
        newIds[t.id] = match.id;
        continue;
      }
      const saved = await saveTemplate({ title: t.title || 'Untitled', type: t.type, subject: t.subject, body: t.body });
      newIds[t.id] = saved.id;
      added += 1;
    }
    const { defaults } = await getSettings();
    for (const [type, id] of Object.entries(data.defaults || {})) {
      if (!defaults[type] && newIds[id]) defaults[type] = newIds[id];
    }
    await saveSettings({ defaults });
    return { added, skipped: data.templates.length - added };
  }

  Object.assign(CN, {
    listTemplates,
    getSettings,
    saveSettings,
    saveTemplate,
    deleteTemplate,
    defaultTemplate,
    exportLibrary,
    importLibrary,
  });
})();
