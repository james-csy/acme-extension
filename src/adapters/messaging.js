// Regular LinkedIn messaging: the messaging page (/messaging/...), and pop-up chats on any page,
// e.g. opened with the Message button on a profile. Message templates aren't auto-filled: the
// panel opens while there's a message box and clicking a template inserts it into that box.
CN.registerAdapter({
  id: 'li-message',
  type: 'message',

  // Sales Navigator has its own (sales-nav.js)
  matches: () =>
    location.pathname.startsWith('/messaging') || (!location.pathname.startsWith('/sales/') && CN.messageBoxes().length > 0),

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
