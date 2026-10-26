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
  // Their company and title: what's been remembered about them (people.js) -- typed into the
  // panel, which saves under `ids` (their profile id and this conversation), or their current job
  // from their profile or lead page -- else read from the headline the conversation shows next to
  // their name (names.js), if it does.
  async getContext(box) {
    const person = box && CN.personNear(box);
    const fullName = person?.fullName || null;
    const thread = location.pathname.match(/^\/messaging\/thread\/([^/]+)/)?.[1];
    const ids = [person?.profileId, thread && `thread:${thread}`].filter(Boolean);
    let known = box ? await CN.recallPerson({ ids, fullName }) : null;
    // Nothing better known: the headline the conversation shows next to their name, remembered
    // (as a guess) for next time
    if (!known?.company && person?.job) {
      known = { ...person.job, source: 'headline' };
      CN.rememberPerson({ ids, fullName, ...known });
      CN.log('[li-message] From the headline in this chat:', fullName, [known.title, known.company].filter(Boolean).join(' at '));
    }
    return {
      name: fullName && CN.firstNameOf(fullName),
      fullName,
      company: known?.company || null,
      title: known?.title || null,
      // 'headline' when the company is a guess from their headline; the panel says so
      companySource: known?.company ? known.source || 'role' : null,
      ids,
    };
  },
});
