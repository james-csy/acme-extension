// Regular LinkedIn: the "Add a note to your invitation" box on a connection request.
// LinkedIn currently has two versions of this dialog:
//   - new app: a TipTap/ProseMirror rich-text editor inside [data-sdui-screen$=".CustomInviteCompose"]
//   - older app: a plain <textarea id="custom-message">, rendered inside the closed
//     #interop-outlet shadow root (seen on profile pages, Oct 2026)
(() => {
  const textOf = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  const linesOf = (el) => [...el.querySelectorAll('p')].map(textOf).filter(Boolean);
  const isDates = (line) => /\d{4}\s*[-–]\s*(Present|\w+ \d{4}|\d{4})\b/.test(line);
  const isCurrent = (line) => /[-–]\s*Present\b/.test(line);

  // The profile owner's current job: the first Experience entry with a role whose dates run to
  // "Present". An entry is either one role -- lines [title, company, dates, ...] -- or a company with
  // its roles listed under it: [company, total time], then per role [title, dates, ...].
  // From the new profile layout (fixtures/connect-note-profile.html); other layouts give nothing,
  // and the template's fallback is used.
  function currentRole(card) {
    for (const entry of card?.querySelectorAll('[componentkey^="entity-collection-item"]') || []) {
      const roles = [...entry.querySelectorAll('li')].filter((li) => linesOf(li).some(isDates));
      if (roles.length) {
        const current = roles.find((li) => linesOf(li).some(isCurrent));
        const company = [...entry.querySelectorAll('p')].find((p) => !p.closest('li'));
        if (current) return { title: linesOf(current)[0], company: company && textOf(company) };
      } else {
        const [title, company, ...rest] = linesOf(entry);
        // "Basecamp · Full-time" -> "Basecamp"
        if (rest.some(isCurrent)) return { title, company: company?.split(' · ')[0] };
      }
    }
    return {};
  }

  CN.registerAdapter({
    id: 'connect-note',
    // Fills the default template of this type (see src/core/types.js)
    type: 'connection_note',

    // Sales Navigator has its own dialogs (and its own textarea[name="message"]), see sales-nav.js
    matches: () => !location.pathname.startsWith('/sales/'),

    fields: [
      {
        key: 'body',
        selectors: [
          '[data-sdui-screen$=".CustomInviteCompose"] [contenteditable="true"][role="textbox"]',
          'textarea#custom-message',
          '[role="dialog"] textarea[name="message"]',
        ],
      },
    ],

    // Connect buttons in search results, "People you may know", sidebars and menus are
    // labelled "Invite <Full Name> to connect" -- remember whose button was clicked
    setup() {
      document.addEventListener(
        'click',
        (event) => {
          const button = event
            .composedPath()
            .find((el) => el.getAttribute?.('aria-label')?.match(/^Invite .+ to connect$/));
          if (!button) return;
          CN.rememberName(button.getAttribute('aria-label').slice('Invite '.length, -' to connect'.length).trim());
        },
        true
      );
    },

    async getContext(doc) {
      const owner = CN.profileName(doc);
      const fullName = (await CN.recentName()) || owner;
      // Their job is only known when the note is for the person whose profile is open, not someone
      // whose Connect button was clicked in a sidebar
      const role = fullName && fullName === owner ? currentRole(doc.querySelector('[componentkey^="profileCardsExperienceOnly"]')) : {};
      return {
        name: fullName && CN.firstNameOf(fullName),
        fullName,
        company: role.company || null,
        title: role.title || null,
      };
    },

    // Who this profile page is about, remembered for messaging threads with them (see people.js).
    // LinkedIn swaps pages without reloading, so only the parts labelled with the profile address
    // in the URL are read; until the new profile has rendered, nothing is.
    personOnPage(doc, path = location.pathname) {
      const slug = path.match(/^\/in\/([^/]+)/)?.[1];
      if (!slug) return null;
      const address = decodeURIComponent(slug);
      const heading = doc.querySelector(`[componentkey="ProfileVerificationTriggerRef-${CSS.escape(address)}"] h2`);
      const card = doc.querySelector(`[componentkey="profileCardsExperienceOnly${CSS.escape(address)}"]`);
      if (!heading || !card) return null;
      // Messaging links to a profile by its id ("ACoAA..."), which the Experience section carries
      const id = card.querySelector('[id$="ExperienceTopLevelSection"]')?.id.match(/ref(ACo[\w-]+?)ExperienceTopLevelSection$/)?.[1];
      return { ids: [id, address], fullName: textOf(heading), ...currentRole(card) };
    },
  });
})();
