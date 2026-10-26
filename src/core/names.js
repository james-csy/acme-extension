// Working out who a note is for.
(() => {
  const RECENT_NAME_TTL_MS = 15000;

  // Adapters call this when the person is known from a click (e.g. a Connect button), with what
  // their card said about their job, if anything ({ company, title }). It's kept in storage, not a
  // variable, so a dialog opening inside another frame can still read it.
  function rememberName(fullName, job = null) {
    chrome.storage.local.set({ clickedName: { name: fullName, company: job?.company || null, title: job?.title || null, at: Date.now() } });
  }

  // { name, company, title } of the person clicked in the last few seconds, or null
  async function recentClick() {
    const { clickedName } = await chrome.storage.local.get('clickedName');
    return clickedName && Date.now() - clickedName.at < RECENT_NAME_TTL_MS ? clickedName : null;
  }
  const recentName = async () => (await recentClick())?.name ?? null;

  // The person whose profile page this is, if it is one
  function profileName(doc) {
    // The name heading next to the verification badge
    const heading = doc.querySelector('[componentkey^="ProfileVerificationTriggerRef-"] h2');
    if (heading?.textContent.trim()) return heading.textContent.trim();

    // Last resort: "(2) Dana Brooks | LinkedIn"
    if (doc.location?.pathname.startsWith('/in/')) {
      const title = doc.title.replace(/^\(\d+\)\s*/, '').replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();
      if (title) return title;
    }
    return null;
  }

  // Ways a conversation names the other person, each with how to read the name off the element.
  // Newer pages label a "View <Name>'s profile" link; the classic messaging page (and its pop-up
  // chat windows) has an "Open <Name>'s profile" link around the name in the conversation header.
  const NAME_SOURCES = [
    ['[aria-label^="View "][aria-label$="s profile"]', (el) => el.getAttribute('aria-label').replace(/^View /, '')],
    ['a.msg-thread__link-to-profile[title^="Open "]', (el) => el.getAttribute('title').replace(/^Open /, '')],
    ['.msg-entity-lockup__entity-title, .msg-overlay-bubble-header__title', (el) => el.textContent],
  ];

  // The person a message box is for: the nearest name source walking out from the box (crossing
  // shadow-root boundaries), with the id from their profile link when there is one. Skip the
  // signed-in person's own name, which appears on their sent messages.
  function personNear(box) {
    const own = ownName();
    let node = box;
    for (let depth = 0; node && depth < 30; depth += 1) {
      node = node.parentElement || node.getRootNode?.().host || null;
      for (const [selector, read] of NAME_SOURCES) {
        for (const el of node?.querySelectorAll?.(selector) || []) {
          const name = read(el).replace(/[’']s profile$/, '').replace(/\s+/g, ' ').trim();
          if (name && name !== own) {
            return { fullName: name, profileId: CN.profileIdOf(el.closest('a[href]')?.getAttribute('href')) };
          }
        }
      }
    }
    return null;
  }

  const nameNear = (box) => personNear(box)?.fullName ?? null;

  // The signed-in person, from the global nav's "Me" photo, when LinkedIn labels it
  function ownName() {
    const doc = window.top === window ? document : null;
    const photo = doc?.querySelector('[data-testid="primary-nav"] img[alt]:not([alt=""]), .global-nav__me-photo[alt]');
    return photo?.getAttribute('alt')?.trim() || null;
  }

  function firstNameOf(fullName) {
    // Drop emoji and symbols, then skip titles like "Dr." so "Dr. Jane Smith" -> "Jane"
    const words = fullName.replace(/[^\p{L}\p{M}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
    const first = words.find((word) => !/^(dr|mr|mrs|ms|miss|mx|prof|sir)$/i.test(word));
    if (!first) return null;
    // "JOSH" -> "Josh"
    return first.length > 1 && first === first.toUpperCase()
      ? first[0] + first.slice(1).toLowerCase()
      : first;
  }

  Object.assign(CN, { rememberName, recentClick, recentName, profileName, personNear, nameNear, firstNameOf });
})();
