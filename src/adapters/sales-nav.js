// Sales Navigator (/sales/...): the Connect dialog's note and the InMail compose window, as opened
// from a lead's page, and the template panel for messages to connections and the inbox (fixtures/salesnav-connect.html and salesnav-inmail.html, captured Oct 2026).
// Sales Navigator labels people and companies with data-anonymize attributes, which stay put when
// its class names change.
(() => {
  const onSalesNav = () => location.pathname.startsWith('/sales/');
  const textOf = (el) => el?.textContent.replace(/\s+/g, ' ').trim() || null;

  // The lead whose page is open: their name, and title and company from the "Current role" block
  function openLead(doc) {
    const title = doc.querySelector('[data-sn-view-name="lead-current-role"] [data-anonymize="job-title"]');
    return {
      fullName: textOf(doc.querySelector('h1[data-anonymize="person-name"]')),
      title: textOf(title),
      // The company link sits in the same line as the title: "<title> at <company>"
      company: textOf(title?.parentElement.querySelector('[data-anonymize="company-name"]')),
    };
  }

  // Title and company only when the dialog is for the lead whose page is open. A dialog opened from
  // a list or search has no reliable current role on the page, so the template's fallback is used.
  function contextFor(fullName, doc) {
    const lead = openLead(doc);
    const isLead = Boolean(fullName) && fullName === lead.fullName;
    return {
      name: fullName && CN.firstNameOf(fullName),
      fullName,
      company: isLead ? lead.company : null,
      title: isLead ? lead.title : null,
    };
  }

  // Who a compose window is for: the recipient's profile link, else its "Conversation with <Name>"
  // label. (Not just any person-name in the window: the sender's signature has one too.)
  function recipientIn(dialog) {
    const link = dialog?.querySelector(
      '[data-control-name="view_recipient_profile"] [data-anonymize^="person"], a[name="view_recipient_profile"] [data-anonymize="person-name"]'
    );
    const label = dialog?.getAttribute('aria-label') || '';
    return textOf(link) || (label.startsWith('Conversation with ') ? label.slice('Conversation with '.length).trim() : null);
  }

  // In the inbox: the nearest name, walking out from the box, that links to a lead page. The
  // conversation header links to the other person; your own name on sent messages doesn't.
  // (Not checked against a saved inbox page yet; the panel's "To:" line shows what was found.)
  function inboxRecipient(box) {
    for (let node = box.parentElement; node; node = node.parentElement) {
      const label = node.getAttribute('aria-label') || '';
      if (label.startsWith('Conversation with ')) return label.slice('Conversation with '.length).trim();
      const name = node.querySelector('a[href*="/sales/lead/"][data-anonymize^="person"], a[href*="/sales/lead/"] [data-anonymize^="person"]');
      if (name) return textOf(name);
    }
    return null;
  }

  // A message to a connection opens the same compose window as an InMail, minus the subject line
  const composingMessage = () =>
    [...document.querySelectorAll('[role="dialog"] textarea[name="message"]')].some(
      (box) => !box.closest('[role="dialog"]').querySelector('input[id^="compose-form-subject"]')
    );

  CN.registerAdapter({
    id: 'sn-connect',
    type: 'connection_note',
    matches: onSalesNav,
    fields: [{ key: 'body', selectors: ['textarea#connect-cta-form__invitation'] }],
    // The open lead, remembered for regular messaging threads with them (see people.js). Lead pages
    // use a Sales Navigator id that regular LinkedIn doesn't, so they're remembered by name only.
    personOnPage(doc, path = location.pathname) {
      if (!path.startsWith('/sales/lead/')) return null;
      const lead = openLead(doc);
      return lead.fullName ? { ids: [], ...lead, source: 'role' } : null;
    },
    // The dialog shows who the invitation is for, above the note
    async getContext(doc, box) {
      const dialog = box?.closest('[role="dialog"]');
      return contextFor(textOf(dialog?.querySelector('[data-anonymize="person-name"]')), doc);
    },
  });

  CN.registerAdapter({
    id: 'sn-inmail',
    type: 'inmail',
    matches: onSalesNav,
    // The subject box is what makes it an InMail; a message to a connection has none
    fields: [
      {
        key: 'subject',
        selectors: ['[role="dialog"] input[id^="compose-form-subject"]', '[role="dialog"] input[aria-label="Subject (required)"]'],
      },
      { key: 'body', selectors: ['textarea[id^="compose-form-text"]', 'textarea[name="message"]'] },
    ],
    async getContext(doc, box) {
      return contextFor(recipientIn(box?.closest('[role="dialog"]')), doc);
    },
  });

  // Messages to connections and replies in the inbox: picked from the panel, like regular
  // LinkedIn messages. Company and title come from the open lead page, else from what's been
  // remembered or typed into the panel (saved under the inbox conversation and the name).
  CN.registerAdapter({
    id: 'sn-message',
    type: 'message',
    matches: () => onSalesNav() && (location.pathname.startsWith('/sales/inbox') || composingMessage()),
    async getContext(box) {
      const dialog = box?.closest('[role="dialog"]');
      const fullName = box ? (dialog && recipientIn(dialog)) || inboxRecipient(box) : null;
      const thread = location.pathname.match(/^\/sales\/inbox\/([^/?#]+)/)?.[1];
      const ids = thread ? [`sn-thread:${thread}`] : [];
      const lead = contextFor(fullName, document);
      const known = box && !lead.company ? await CN.recallPerson({ ids, fullName }) : null;
      const companySource = lead.company ? 'role' : known?.company ? known.source || 'role' : null;
      return { ...lead, company: lead.company || known?.company || null, title: lead.title || known?.title || null, companySource, ids };
    },
  });
})();
