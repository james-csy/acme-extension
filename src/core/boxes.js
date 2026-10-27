// Any text box on LinkedIn, not just the ones an adapter knows: which kind of template fits it,
// its subject line if it has one, and who it's for. The panel uses this for whatever box you're in,
// so a box LinkedIn adds or redesigns still gets templates, with as much about the person as can be
// found. What's found, and how, is shown in the panel so a guess can be checked before sending.
(() => {
  // Some adapter selectors use the descendant form ('[role="dialog"] textarea'); matches() handles
  // those, but a selector the browser rejects shouldn't break every box
  const matchesAny = (box, selectors) =>
    selectors.some((selector) => {
      try {
        return box.matches(selector);
      } catch {
        return false;
      }
    });

  // A one-line box labelled as a subject, in the same form or window as the message box: an
  // InMail, Sales Navigator's compose window, a free message to someone you're not connected to
  function subjectFor(box) {
    const isSubject = (input) =>
      /subject/i.test(['name', 'id', 'placeholder', 'aria-label'].map((attr) => input.getAttribute(attr) || '').join(' ')) &&
      input.getClientRects().length > 0;
    let node = box.parentElement;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      const found = [...node.querySelectorAll('input:not([type]), input[type="text"]')].find(isSubject);
      if (found) return found;
      if (node.matches('form, [role="dialog"]')) break;
    }
    return null;
  }

  // { type, subject, owner }: the template type that fits the box best (the others can still be
  // used), its subject line, and the auto-fill adapter whose box it is, if any
  function describeBox(box) {
    const owner = CN.adapters.find((a) => a.fields?.some((field) => matchesAny(box, field.selectors))) || null;
    const subject = subjectFor(box);
    const label = ['aria-label', 'placeholder', 'name', 'id'].map((attr) => box.getAttribute(attr) || '').join(' ');
    const type = owner?.type || (subject ? 'inmail' : /invitation|add a note/i.test(label) ? 'connection_note' : 'message');
    return { type, subject, owner };
  }

  // Buttons that open a message to someone: "Message Riley Zahm" (profiles, sidebars, search) or
  // just "Message" on the profile being viewed. Remembered like a Connect click (names.js), so a
  // message window that doesn't name the person still gets their name.
  document.addEventListener(
    'click',
    (event) => {
      const button = event.composedPath().find((el) => el.matches?.('a, button'));
      const tidy = (text) => (text || '').replace(/\s+/g, ' ').trim();
      const label = tidy(button?.getAttribute('aria-label'));
      // The name only from a label: link text like "Message history" isn't a person
      const named = label.match(/^(?:Message|Send InMail to)\s+(.+)$/i)?.[1];
      const bare = /^message$/i.test(label || tidy(button?.textContent));
      const fullName = named || (bare && location.pathname.startsWith('/in/') ? CN.profileName(document) : null);
      if (fullName) CN.rememberName(fullName);
    },
    true
  );

  // The clicked name, kept per box: a click only counts for a few seconds, the box stays open longer
  const clickedFor = new WeakMap();
  async function clickFor(box) {
    if (!clickedFor.has(box)) {
      const click = await CN.recentClick();
      if (click) clickedFor.set(box, click);
    }
    return clickedFor.get(box) || null;
  }

  // The person the page is about: a profile or Sales Navigator lead page (their job too, once it
  // has rendered), else just the name on a profile
  function personOnPage() {
    const doc = CN.pageDocument();
    for (const adapter of CN.adapters) {
      const person = adapter.personOnPage && adapter.matches() && adapter.personOnPage(doc);
      if (person?.fullName) return person;
    }
    const fullName = location.pathname.startsWith('/in/') ? CN.profileName(doc) : null;
    return fullName ? { ids: [], fullName } : null;
  }

  // Fills in what an adapter didn't find, best first:
  //   name:            the conversation around the box; the Message/Connect button just clicked;
  //                    the person whose profile or lead page this is
  //   company, title:  remembered for them (people.js); their page's current role; what the
  //                    clicked card or the conversation's headline said
  // `nameSource` and `companySource` say where they came from, for the panel.
  async function fillGaps(box, found) {
    let { fullName = null, company = null, title = null, companySource = null, ids = [] } = found;
    // 'chat', 'clicked' or 'page' when found here; 'adapter' when the adapter found it
    let nameSource = fullName ? found.nameSource || 'adapter' : null;
    const jobs = [];
    const near = fullName ? null : CN.personNear(box);
    if (near) {
      ({ fullName } = near);
      nameSource = 'chat';
      ids = [...ids, near.profileId].filter(Boolean);
      if (near.job) jobs.push({ ...near.job, source: 'headline' });
    }
    if (!fullName) {
      const click = await clickFor(box);
      if (click) {
        fullName = click.name;
        nameSource = 'clicked';
        if (click.company) jobs.push({ company: click.company, title: click.title, source: 'headline' });
      }
    }
    const page = personOnPage();
    if (!fullName && page) {
      fullName = page.fullName;
      nameSource = 'page';
    }
    if (page && fullName === page.fullName) {
      ids = [...new Set([...ids, ...(page.ids || []).filter(Boolean)])];
      if (page.company || page.title) jobs.unshift({ company: page.company, title: page.title, source: page.source || 'role' });
    }
    if (!company && (fullName || ids.length)) {
      const known = await CN.recallPerson({ ids, fullName });
      if (known?.company || known?.title) jobs.unshift({ ...known, source: known.source || 'role' });
    }
    const job = jobs.find((j) => j.company);
    if (!company && job) [company, companySource] = [job.company, job.source];
    title = title || job?.title || jobs.find((j) => j.title)?.title || null;
    return {
      ...found,
      name: fullName && CN.firstNameOf(fullName),
      fullName,
      company,
      title,
      companySource: company ? companySource || 'role' : null,
      nameSource,
      ids,
    };
  }

  // Everything known about who a box is for: from the adapter that knows the box (an auto-fill
  // dialog's, else the page's pick-from-list adapter), then the gaps filled in above
  async function contextForBox(box, pageAdapter) {
    if (!box) return {};
    const { owner } = describeBox(box);
    let found = {};
    try {
      if (owner) found = await owner.getContext(CN.pageDocument(), box);
      else if (pageAdapter) found = await pageAdapter.getContext(box);
    } catch (error) {
      CN.log('Reading who this box is for failed:', error);
    }
    return fillGaps(box, found || {});
  }

  Object.assign(CN, { describeBox, contextForBox });
})();
