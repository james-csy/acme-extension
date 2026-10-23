// Toolbar popup: see and switch the default template for each auto-fill type, turn auto-fill
// on or off, open the editor, and save the current LinkedIn page for debugging.

const defaultsEl = document.getElementById('defaults');
const messageCount = document.getElementById('message-count');
const autoFill = document.getElementById('auto-fill');
const status = document.getElementById('status');
const offNote = document.getElementById('off-note');

// "connection note", but "InMail" keeps its capitals
const lower = (label) => (label === 'InMail' ? label : label.toLowerCase());

// With auto-fill off the defaults stay editable but are dimmed, with a note saying why
function showAutoFillState(on) {
  defaultsEl.classList.toggle('off', !on);
  offNote.hidden = on;
}

async function render() {
  const [templates, settings] = await Promise.all([CN.listTemplates(), CN.getSettings()]);
  defaultsEl.replaceChildren();

  for (const [type, { label, mode }] of Object.entries(CN.TEMPLATE_TYPES)) {
    if (mode !== 'auto') continue;
    const field = document.createElement('div');
    field.className = 'field';
    const name = document.createElement('label');
    name.textContent = `Default ${lower(label)}`;
    name.htmlFor = `default-${type}`;
    const select = document.createElement('select');
    select.id = `default-${type}`;
    const options = templates.filter((t) => t.type === type);
    select.append(new Option(options.length ? "None (don't auto-fill)" : `No ${lower(label)} templates yet`, ''));
    for (const t of options) select.append(new Option(t.title, t.id, false, settings.defaults[type] === t.id));
    select.addEventListener('change', () =>
      CN.saveSettings(({ defaults }) => {
        if (select.value) defaults[type] = select.value;
        else delete defaults[type];
        return { defaults };
      })
    );
    field.append(name, select);
    defaultsEl.append(field);
  }

  const messages = templates.filter((t) => t.type === 'message').length;
  messageCount.textContent = messages ? `${messages} in the messaging panel` : 'None yet';
  autoFill.checked = settings.autoFill;
  showAutoFillState(settings.autoFill);
}

autoFill.addEventListener('change', () => {
  showAutoFillState(autoFill.checked);
  CN.saveSettings({ autoFill: autoFill.checked });
});

document.getElementById('edit').addEventListener('click', () => chrome.runtime.openOptionsPage());

document.getElementById('capture').addEventListener('click', async () => {
  status.className = 'status';
  status.textContent = 'Saving…';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let result = null;
  try {
    result = await chrome.tabs.sendMessage(tab.id, { type: 'capture-page' });
  } catch {
    // No content script answered: not a LinkedIn tab, or one opened before the extension was installed
  }
  if (result?.ok) {
    status.textContent = `Saved ${result.file} to Downloads`;
    return;
  }
  status.className = 'status error';
  status.textContent = result
    ? `Couldn't save this page: ${result.error}`
    : 'Open a LinkedIn tab (and refresh it once after installing), then try again.';
});

render();
