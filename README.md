# LinkedIn Connect Note

Chrome extension that fills your saved templates into LinkedIn message boxes. It never clicks Send.

## Install

It isn't in the Chrome Web Store, so it's loaded as an "unpacked" extension. Takes about a minute.

1. **Get the files.** Either unzip the `linkedin-connect-note-<version>.zip` you were sent, or on
   GitHub click **Code → Download ZIP** and unzip that. Put the folder somewhere it can stay (e.g.
   Documents): Chrome loads it from there every time, so don't delete or move it afterwards.
2. In Chrome, go to `chrome://extensions` (paste it into the address bar).
3. Turn on **Developer mode** (switch in the top-right corner).
4. Click **Load unpacked** and choose the unzipped folder: the one with `manifest.json` directly
   inside it.
5. Pin it: click the puzzle-piece icon next to the address bar, then the pin next to
   **LinkedIn Connect Note**.
6. **Refresh any LinkedIn tabs** that were already open.
7. Click the extension's icon → **Edit templates** and create your first connection note. The first
   one of each type becomes its default, which is what gets filled in automatically.

Then click **Connect → Add a note** on LinkedIn: the note fills in by itself. Check it, then send.
It never clicks Send for you.

**Updating:** replace the folder's contents with the new version, click the reload arrow on the
extension's card in `chrome://extensions`, then refresh LinkedIn. Your templates are kept: they're
saved in your Chrome profile, not in the folder.

**If nothing fills in:** refresh the LinkedIn tab, and check in the popup that auto-fill is on and a
default connection note is chosen. Still nothing: open DevTools (⌥⌘J / Ctrl+Shift+J), filter the
Console for `Connect Note`, and send what it says along with a capture from popup →
**Save this page for debugging**.

Chrome may show a "Disable developer mode extensions" notice at startup; click away from it to
keep the extension on.

## Developing

After changing any file, click the reload arrow on the extension's card and refresh LinkedIn.
To package a build to send someone: `zip -r linkedin-connect-note-<version>.zip manifest.json src icons`.

## Templates

Each person keeps their own library, saved in their Chrome profile. Every template has a title,
a type and a message (InMails also have a subject). Types decide how a template is used:

| Type | Used by | How |
| --- | --- | --- |
| Connection note | LinkedIn "Add a note", Sales Navigator Connect | Auto-fill from the type's default |
| InMail | Sales Navigator InMail | Auto-fill (subject + message) from the default |
| Message | LinkedIn messaging; Sales Navigator messages to connections and inbox | Picked from the in-page panel, inserted into the open conversation (or the box you last clicked) |

Variables: `{name}`, `{fullName}`, `{company}` and `{title}`. Company and title come from a Sales
Navigator lead's current role, or the current role in a profile's Experience section. Messaging
threads don't show them, so they're remembered from profile and lead pages you've opened (on this
device), or typed into the panel's Company field. Not every page has them, so those two need a
fallback: `{company|your team}`. Casing: `{name:upper}`, `:lower`, `:title`.

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
  people.js              company/title remembered from profile and lead pages, for messaging
  fill.js                filling textareas/inputs and rich-text editors
  storage.js             template library, defaults, settings, export/import, migration
  focus.js               which text box the panel inserts into (incl. closed shadow roots, frames)
  watch.js               finds boxes (page, closed shadow root, frames) and fills them
  capture.js             "Save this page for debugging" (includes closed shadow roots)
src/panel/panel.js       the docked template panel on pick-from-list pages
src/adapters/            one file per LinkedIn box
  connect-note.js        regular LinkedIn "Add a note to your invitation"
  sales-nav.js           Sales Navigator Connect note, InMail, messages and inbox
  messaging.js           regular LinkedIn messaging (panel, not auto-fill)
src/background.js        opens the editor page when the panel asks
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
