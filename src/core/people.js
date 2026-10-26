// What we've learned about people, for pages that don't show it. A messaging thread has only the
// person's name and a profile link, so their company and job title are remembered from pages the
// user opened earlier (their profile, their Sales Navigator lead page) or from what the user typed
// in the panel. Kept in chrome.storage.local (this device only), one key per way of recognising
// someone: 'person:<profile id>', 'person:<profile address>', 'person:name:<full name>'.
//
// Each record says where its company came from, and a weaker source never replaces a stronger one:
// typed in the panel > the current job on their profile or lead page ('role') > read from their
// headline ('headline', a guess; see headline.js).
(() => {
  const PREFIX = 'person:';
  const RANK = { headline: 1, role: 2, typed: 3 };

  // Most specific first: ids, then the name (two people with the same name are rare among the
  // ones one person looks at, but an id match always wins)
  function keysFor({ ids = [], fullName }) {
    const keys = ids.filter(Boolean).map((id) => PREFIX + id);
    if (fullName) keys.push(`${PREFIX}name:${fullName.toLowerCase()}`);
    return keys;
  }

  async function rememberPerson({ ids, fullName, company, title, source = 'role' }) {
    const keys = keysFor({ ids, fullName });
    if (!keys.length) return;
    const existing = await chrome.storage.local.get(keys);
    const record = { fullName, company: company || null, title: title || null, source, at: Date.now() };
    const kept = (old) => old?.company && (RANK[old.source] ?? RANK.role) > RANK[source];
    const updates = keys.filter((key) => !kept(existing[key])).map((key) => [key, record]);
    if (updates.length) await chrome.storage.local.set(Object.fromEntries(updates));
  }

  async function recallPerson({ ids, fullName }) {
    const keys = keysFor({ ids, fullName });
    if (!keys.length) return null;
    const found = await chrome.storage.local.get(keys);
    return keys.map((key) => found[key]).find(Boolean) || null;
  }

  // Called on every check: once per page, ask the adapters what the page says about its person.
  // Only the main page is read, and only once the page shows a company or job title.
  let notedHref = null;
  function notePerson() {
    if (window !== window.top || location.href === notedHref) return;
    for (const adapter of CN.adapters) {
      if (!adapter.personOnPage || !adapter.matches()) continue;
      const person = adapter.personOnPage(document);
      if (!person || !(person.company || person.title)) continue;
      notedHref = location.href;
      rememberPerson(person);
      CN.log(`[${adapter.id}] Remembered`, person.fullName, [person.title, person.company].filter(Boolean).join(' at '), `(${person.source || 'role'})`);
      return;
    }
  }

  // The id in a profile link: /in/dana-brooks/ -> "dana-brooks", /in/ACoAAB.../ -> "ACoAAB..."
  const profileIdOf = (href) => {
    const id = href?.match(/\/in\/([^/?#]+)/)?.[1];
    return id ? decodeURIComponent(id) : null;
  };

  Object.assign(CN, { rememberPerson, recallPerson, notePerson, profileIdOf });
})();
