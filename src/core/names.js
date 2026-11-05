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
  // Only when those find nothing: a new message, whose header just says "New message", names them
  // in the recipient chip ("Jasper Bennett ×", whose remove button is labelled "Remove <Name>") and
  // in the profile card under it, which links their name to their profile. Looked for only close
  // to the box (in its window): in a conversation the messages' avatar links come before the
  // header, and a page's other profile links ("People also viewed") aren't the person either.
  const NEAR = 10;
  const NEW_MESSAGE_SOURCES = [
    ['button[aria-label^="Remove "]', (el) => el.getAttribute('aria-label').replace(/^Remove /, '')],
    ['a[href*="/in/"]', (el) => el.textContent],
  ];

  // A window title, a button's label or an avatar's online status isn't a name: "New message",
  // "Remove attachment", "Status is offline"
  const NOT_A_NAME = /^(new message|new group|messaging|compose|attachment|status is)\b/i;
  const looksLikeName = (text) =>
    text.length <= 60 && /^\p{Lu}/u.test(text) && !/\d/.test(text) && text.split(' ').length <= 6 && !NOT_A_NAME.test(text);

  // The first name one of `sources` gives, walking out from the box (crossing shadow-root
  // boundaries) at most `maxDepth` levels, with the id from their profile link when there is one.
  // Skips the signed-in person's own name, which appears on their sent messages.
  function findPerson(box, sources, maxDepth) {
    const own = ownName();
    let node = box;
    for (let depth = 0; node && depth < maxDepth; depth += 1) {
      node = node.parentElement || node.getRootNode?.().host || null;
      for (const [selector, read] of sources) {
        for (const el of node?.querySelectorAll?.(selector) || []) {
          const name = read(el).replace(/Status is \w+/g, '').replace(/[’']s profile$/, '').replace(/\s+/g, ' ').trim();
          if (looksLikeName(name) && name !== own) {
            return { fullName: name, profileId: CN.profileIdOf(el.closest('a[href]')?.getAttribute('href')), job: jobNear(node, el, name) };
          }
        }
      }
    }
    return null;
  }

  // The person a message box is for. `job` is their job when the conversation shows their headline
  // next to their name (see below).
  const personNear = (box) => findPerson(box, NAME_SOURCES, 30) || findPerson(box, NEW_MESSAGE_SOURCES, NEAR);

  const nameNear = (box) => personNear(box)?.fullName ?? null;

  // Their job, from a headline the conversation shows next to their name: in the chat header, or
  // the profile card at the top of a new conversation. Looks at each place their name or profile
  // link appears in the conversation, and reads the line right after their name (skipping the
  // connection degree and pronouns) as a headline. Beside their messages that line is a time, and
  // online status ("Mobile • 1h ago") isn't a headline either, so those give nothing (headline.js).
  const NOT_HEADLINE = /^[·•]?\s*(1st|2nd|3rd\+?)\b|degree connection|^\(?\s*(he|she|they)\s*\//i;
  function jobNear(conversation, nameElement, fullName) {
    const id = CN.profileIdOf(nameElement.closest('a[href]')?.getAttribute('href'));
    const links = id ? [...conversation.querySelectorAll('a[href*="/in/"]')].filter((a) => CN.profileIdOf(a.getAttribute('href')) === id) : [];
    for (const spot of new Set([nameElement, ...links])) {
      // The smallest container around it with a line after the name, kept short so it's the
      // header or card, not the whole conversation
      let container = spot;
      for (let i = 0; i < 4 && container.parentElement; i += 1) {
        container = container.parentElement;
        const text = container.innerText || '';
        if (text.length > 400) break;
        const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
        // After the last line with their name: a new message names them in the recipient chip and
        // again in the profile card, above the headline
        const after = lines.slice(lines.findLastIndex((line) => line.includes(fullName)) + 1).filter((line) => !NOT_HEADLINE.test(line));
        if (!lines.some((line) => line.includes(fullName)) || !after.length) continue;
        const job = CN.companyFromHeadline(after[0]);
        if (job) return job;
        break; // the line after the name here isn't a headline: try the next place they're named
      }
    }
    return null;
  }

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
