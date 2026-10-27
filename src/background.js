// Content scripts can't open the extension's options page or reload the extension themselves;
// the panel asks here. The popup and the panel ask here to check for updates.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'open-options') chrome.runtime.openOptionsPage();
  if (message?.type === 'check-update') {
    checkForUpdates({ force: Boolean(message.force) }).then(sendResponse);
    return true; // answering later
  }
  // The panel's Update button: reload, then refresh the tab it was clicked in (see onInstalled)
  if (message?.type === 'apply-update') {
    chrome.storage.local.set({ refreshTab: sender.tab?.id ?? null }).then(() => chrome.runtime.reload());
  }
});

// ---- Updates ---------------------------------------------------------------------------------
// Chrome never updates an extension loaded from a folder, so there are two ways it gets updated:
// - Installed with install/install.sh (auto-update.json in the folder): a launchd job copies newer
//   releases into the folder every 6 hours. The popup's Check for updates also runs it right away,
//   through the helper it registers with the browser (install/native-host.sh;
//   installs from before it existed get it on their next update). When the folder's manifest has a different version from the one
//   running, reload: straight away if no LinkedIn tab is open (nothing to lose), else once the
//   last one closes, or from the popup.
// - Otherwise: once a day compare with the latest release on GitHub, and when there's a newer one
//   show "NEW" on the toolbar icon; the popup says how to update.
// Either way `notice` in local storage says so ({ kind: 'ready' | 'available', version }), which
// the template panel shows on LinkedIn, since few people open the toolbar popup.
const REPO = 'james-csy/acme-extension';
const LATEST_RELEASE = `https://api.github.com/repos/${REPO}/releases/latest`;
const CHECK_EVERY_MINUTES = 60;
const GITHUB_EVERY_MS = 24 * 60 * 60 * 1000;
const LINKEDIN_TABS = { url: 'https://www.linkedin.com/*' };
const UPDATER = 'com.connectnote.updater';
const running = chrome.runtime.getManifest().version;

// "0.12.0" newer than "0.11.3"?
function isNewer(version, than) {
  const [a, b] = [version, than].map((v) => v.split('.').map(Number));
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

// The extension's own files, as they are in the folder now (not as loaded)
async function readOwnFile(path) {
  try {
    const response = await fetch(chrome.runtime.getURL(path), { cache: 'no-store' });
    return response.ok ? await response.json() : null;
  } catch {
    return null; // not there
  }
}

function announce(notice) {
  chrome.action.setBadgeText({ text: notice ? 'NEW' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#0a66c2' });
  chrome.storage.local.set({ notice });
}

// Auto-updated install: the version now in the folder, if it isn't the one running
async function checkFolder() {
  const onDisk = (await readOwnFile('manifest.json'))?.version;
  const installed = onDisk && onDisk !== running ? onDisk : null;
  if (installed && !(await chrome.tabs.query(LINKEDIN_TABS)).length) {
    console.log('[Connect Note] Reloading to start', installed);
    chrome.runtime.reload();
  }
  announce(installed ? { kind: 'ready', version: installed } : null);
  return installed;
}

// Auto-updated install: download a newer release into the folder now. The helper's answer
// ({ ok, before, after, log }), or null if it isn't registered with this browser yet.
async function runUpdater() {
  try {
    return await chrome.runtime.sendNativeMessage(UPDATER, { type: 'update' });
  } catch (error) {
    console.log('[Connect Note] Update helper not available:', error.message);
    return null;
  }
}

// Other installs: the latest release on GitHub, if newer. Offline or GitHub unreachable: what the last
// check found.
async function checkGitHub(force) {
  const { update } = await chrome.storage.local.get('update');
  if (!force && update?.checkedAt > Date.now() - GITHUB_EVERY_MS) return update;
  try {
    const response = await fetch(LATEST_RELEASE, { cache: 'no-store' });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const { tag_name: tag } = await response.json();
    const version = tag.replace(/^v/, '');
    const download = `https://github.com/${REPO}/archive/refs/tags/${tag}.zip`;
    const next = { latest: isNewer(version, running) ? version : null, download, checkedAt: Date.now() };
    await chrome.storage.local.set({ update: next });
    return next;
  } catch (error) {
    console.log('[Connect Note] Update check failed:', error.message);
    return { ...update, error: error.message };
  }
}

// Returns { auto, installed, ran } for an auto-updated install (`ran`: the helper answered), else
// { auto, latest, download, error }. `force` (a click on Check for updates) runs the auto-updater first.
async function checkForUpdates({ force = false } = {}) {
  if (await readOwnFile('auto-update.json')) {
    const ran = force ? await runUpdater() : null;
    const error = ran && !ran.ok ? ran.log || 'the updater failed' : undefined;
    return { auto: true, installed: await checkFolder(), ran: Boolean(ran), error };
  }
  const update = await checkGitHub(force);
  announce(update?.latest ? { kind: 'available', version: update.latest } : null);
  return { auto: false, ...update };
}

function scheduleChecks() {
  chrome.alarms.create('update-check', { periodInMinutes: CHECK_EVERY_MINUTES });
  checkForUpdates();
}
chrome.runtime.onInstalled.addListener(scheduleChecks);
// Reloaded from the panel's Update button: refresh that LinkedIn tab so it runs the new version
chrome.runtime.onInstalled.addListener(async () => {
  const { refreshTab } = await chrome.storage.local.get('refreshTab');
  if (refreshTab == null) return;
  chrome.storage.local.remove('refreshTab');
  chrome.tabs.reload(refreshTab).catch(() => {}); // closed meanwhile
});
chrome.runtime.onStartup.addListener(scheduleChecks);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'update-check') checkForUpdates();
});
// Waiting to reload until LinkedIn is closed: check again whenever a tab closes
chrome.tabs.onRemoved.addListener(() => checkForUpdates());
