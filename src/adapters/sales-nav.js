// Sales Navigator (/sales/...): the Connect dialog's note and the InMail compose window, as opened
// from a lead's page (fixtures/salesnav-connect.html and salesnav-inmail.html, captured Oct 2026).
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
      return lead.fullName ? { ids: [], ...lead } : null;
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
    // The recipient's profile link in the compose window, else its "Conversation with <Name>" label.
    // (Not just any person-name in the window: the sender's signature has one too.)
    async getContext(doc, box) {
      const dialog = box?.closest('[role="dialog"]');
      const label = dialog?.getAttribute('aria-label') || '';
      const fullName =
        textOf(dialog?.querySelector('a[name="view_recipient_profile"] [data-anonymize="person-name"]')) ||
        (label.startsWith('Conversation with ') ? label.slice('Conversation with '.length).trim() : null);
      return contextFor(fullName, doc);
    },
  });
})();
