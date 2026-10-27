# LinkedIn Connect Note

Chrome extension that fills your saved templates into LinkedIn message boxes. It never clicks Send.

## Install (Mac)

Takes about two minutes. After this it keeps itself up to date.

1. **Open Terminal:** press **⌘ Space**, type `Terminal`, press **Return**.
2. **Paste this line and press Return:**
   ```
   curl -fsSL https://raw.githubusercontent.com/james-csy/acme-extension/main/install/install.sh | bash
   ```
   It puts the extension in a **ConnectNote** folder in your home folder and opens it. macOS may
   show a "Background Items Added" notice: that's the part that downloads updates. Leave it on.
3. **In your browser** (Chrome, Dia, Arc or Brave), go to `chrome://extensions` and turn on
   **Developer mode** (switch in the top-right corner).
4. Click **Load unpacked**, press **⌘ Shift H** to jump to your home folder, choose **ConnectNote**
   and click **Select**.
5. **Pin it:** click the puzzle-piece icon next to the address bar, then the pin next to
   **LinkedIn Connect Note**.
6. **Refresh any LinkedIn tabs** that were already open.
7. Click the extension's icon → **Edit templates** and create your first templates. The first
   connection note becomes the default, which is what gets filled in automatically.

Then click **Connect → Add a note** on LinkedIn: the note fills in by itself. Check it, then send.
It never clicks Send for you. In messages, pick a template from the panel next to the message box.

Don't move or rename the ConnectNote folder: the browser loads the extension from there, and
updates are delivered there. Your templates are saved in your browser profile, not in the folder.

The browser may show a "Disable developer mode extensions" notice at startup; close it to keep the
extension on.

### Updating

Nothing to do. A few times a day your Mac checks for a new version and downloads it into the
ConnectNote folder. Then either:

- the template panel on LinkedIn shows **Update ready** → click **Update** (the page refreshes), or
- it switches over by itself the next time you have no LinkedIn tabs open.

Installed without the Terminal step (from a zip, on Windows)? The panel says when a new version is
out. Download it from [Releases](https://github.com/james-csy/acme-extension/releases/latest),
copy its files over your extension folder, then click the extension's icon → **Reload** and refresh
LinkedIn.

### Uninstall

```
curl -fsSL https://raw.githubusercontent.com/james-csy/acme-extension/main/install/uninstall.sh | bash
```

Then click **Remove** on the extension in `chrome://extensions` (this also deletes your templates;
use **Export** in the editor first to keep them).

### If nothing fills in

Refresh the LinkedIn tab, and check in the popup that auto-fill is on and a default connection note
is chosen. Still nothing: open DevTools (⌥⌘J), filter the Console for `Connect Note`, and send what
it says along with a capture from popup → **Save this page for debugging**.

## Releasing

Installed copies follow the latest [GitHub release](https://github.com/james-csy/acme-extension/releases),
not the `main` branch, so pushing to `main` ships nothing. To ship:

```
scripts/release.sh 0.12.1 "Short note on what changed"
```

It sets the version in `manifest.json`, commits, tags `v0.12.1`, pushes, and publishes the release
(needs the GitHub CLI, `gh`, logged in). Each installed copy's updater
(`~/Library/Application Support/ConnectNote/update.sh`, run by launchd at login and every 6 hours)
downloads it, and the extension switches over as described in [Updating](#updating). Versions only
go up: to undo a release, release the old code with a higher version. The repo must stay public,
since the updater downloads without signing in.

## Developing

Work in your git checkout, loaded as a separate unpacked extension (turn off your installed copy
meanwhile, or both fill the same boxes). After changing any file, click the reload arrow on the
extension's card and refresh LinkedIn.

To try the updater without publishing, point it at a local zip:
`CONNECT_NOTE_TAG=v0.12.1 CONNECT_NOTE_ZIP=file:///path/to/zip bash ~/Library/Application\ Support/ConnectNote/update.sh`
(the zip's manifest must say 0.12.1). Its log is `update.log` next to it.

## Templates

Each person keeps their own library, saved in their Chrome profile. Every template has a title,
a type and a message (InMails also have a subject). Types decide how a template is used:

| Type | Used by | How |
| --- | --- | --- |
| Connection note | LinkedIn "Add a note", Sales Navigator Connect | Auto-fill from the type's default |
| InMail | Sales Navigator InMail | Auto-fill (subject + message) from the default |
| Message | LinkedIn messaging; Sales Navigator messages to connections and inbox | Picked from the in-page panel, inserted into the open conversation (or the box you last clicked) |

Any other text box works too: click into it and the panel appears beside it (a free message, a
connection note, or a box LinkedIn added since), open or minimized to a small button, whichever you
left it as. The panel lists every template, the
type that fits the box first (InMail when the box has a subject line, which it fills too) and the
others folded underneath. It shows who the text is for in To / Company / Title fields you can
correct, marking guesses: a name taken from the Message button you clicked or from the profile
you're on, a company read from a headline.

Variables: `{name}`, `{fullName}`, `{company}` and `{title}`. Company and title come from, best first:
what you typed into the panel's Company field; a Sales Navigator lead's current role, or the current
role in a profile's Experience section; else their headline (`Head of Sales @ Acme`, `VP Sales at
Acme`, a search result's `Current: … at …` line), read only when the pattern is unmistakable
(`src/core/headline.js`; old jobs, sentences and placeholders like "Stealth" give nothing). The
panel marks a headline guess "from headline". Messaging threads don't show any of this, so it's
remembered from profile and lead pages you've opened (on this device). Not every page has them, so
those two need a fallback: `{company|your team}`. Casing: `{name:upper}`, `:lower`, `:title`.

Manage them on the options page (popup → **Edit templates**). The popup switches the default per type,
turns auto-fill off, and has **Save this page for debugging**. Export/Import moves a library between
people or machines.

## Layout

```
manifest.json            content scripts load in the order listed here
src/core/                shared by every box
  namespace.js           the CN object every file adds to, logging, adapter registry
  types.js               template types: fields, auto-fill or picker, character limits
  template.js            filling {variables}: :lower :upper :title casing, |fallback text
  names.js               first-name parsing, profile name, clicked-name memory, recipient near a box
  headline.js            company and job title from a headline, only when unmistakable
  people.js              company/title remembered from profile and lead pages, for messaging,
                         ranked by source (typed > current role > headline)
  fill.js                filling textareas/inputs and rich-text editors
  storage.js             template library, defaults, settings, export/import, migration
  focus.js               which text box the panel inserts into (incl. closed shadow roots, frames)
  boxes.js               any text box: the template type that fits it, its subject line, who it's for
  watch.js               finds boxes (page, closed shadow root, frames) and fills them
  capture.js             "Save this page for debugging" (includes closed shadow roots)
src/panel/panel.js       the template panel, beside chats and any text box clicked into
src/adapters/            one file per LinkedIn box
  connect-note.js        regular LinkedIn "Add a note to your invitation"
  sales-nav.js           Sales Navigator Connect note, InMail, messages and inbox
  messaging.js           regular LinkedIn messaging (panel, not auto-fill)
src/background.js        opens the editor page when the panel asks; update checks and reloading
install/                 Mac installer, updater (run by launchd) and uninstaller
scripts/release.sh       publishes a release
icons/                   extension icon: icon.svg (48/128 px) and icon-small.svg (16/32 px), plus PNGs
src/options/             the template editor page
src/popup/               the toolbar popup
fixtures/                saved LinkedIn pages, used by the tests
tests/run.html           test page
tests/preview.html       opens the editor or popup with sample data, for design review
```

There's no build step: each file adds its part to a shared `CN` object, in manifest order.

## Adding a box

1. With the box open on LinkedIn, use popup → **Save this page for debugging** and put the file in
   `fixtures/`. (A normal "Save page" misses LinkedIn's closed shadow roots.)
2. Create `src/adapters/<id>.js` that calls `CN.registerAdapter({ ... })` with:
   - `id`: used in log lines
   - `type`: the template type it fills (see `src/core/types.js`)
   - `matches()`: true on the pages where this box appears
   - `fields`: `[{ key, selectors }]`, keys matching the type's fields; the first field's box
     appearing means "the dialog is open"
   - `getContext(doc, box)`: returns the variables for the template, e.g. `{ name, fullName, company, title }`.
     Auto-fill passes the top page's document and the box found; the panel passes only the box
   - `setup()` (optional): runs once, e.g. to remember a clicked name
   - `personOnPage(doc)` (optional): `{ ids, fullName, company, title }` for the person a page is
     about, remembered for messaging (see `src/core/people.js`)
3. List the file in `manifest.json` before `src/content.js`, and in `tests/run.html`.
4. Add fixture and end-to-end checks to `tests/run.html`.

Prefer stable attributes (`id`, `name`, `aria-label`, `data-*`) over class names, which LinkedIn regenerates.

## Tests

```
python3 -m http.server 8771
```

Then open http://127.0.0.1:8771/tests/run.html. `fixtures/` holds saved LinkedIn pages, which
contain real people's details, so it's kept out of git; so is `fixtures/expected.json`, what each
page should give. Without them the fixture checks are skipped and the rest still run.

## Debugging

In the LinkedIn tab's Console, filter for `Connect Note`. Lines are prefixed with the adapter id,
e.g. `[connect-note] Box found` → `Using "Connection note"` → `Context: {...}` → `Filled`.
