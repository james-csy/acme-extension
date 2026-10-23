// Regular LinkedIn messaging (/messaging/...). Message templates aren't auto-filled: the panel
// opens on these pages and clicking a template inserts it into the box you last typed in.
CN.registerAdapter({
  id: 'li-message',
  type: 'message',

  matches: () => location.pathname.startsWith('/messaging'),

  // `box` is the message box the template goes into, or null if none is known yet.
  // A conversation shows only the person's name and profile link, so their company and title
  // come from what's been remembered about them (people.js): from their profile or lead page, or
  // typed into the panel, which saves under `ids` (their profile id and this conversation).
  async getContext(box) {
    const person = box && CN.personNear(box);
    const fullName = person?.fullName || null;
    const thread = location.pathname.match(/^\/messaging\/thread\/([^/]+)/)?.[1];
    const ids = [person?.profileId, thread && `thread:${thread}`].filter(Boolean);
    const known = box ? await CN.recallPerson({ ids, fullName }) : null;
    return {
      name: fullName && CN.firstNameOf(fullName),
      fullName,
      company: known?.company || null,
      title: known?.title || null,
      ids,
    };
  },
});
