// The kinds of template, and how each is used.
//   auto:   filled into the box automatically from the type's default template
//   picker: chosen from the in-page panel and inserted at the cursor
//
// `variables` lists what can be filled in for boxes that use the type (checked against saved pages
// in fixtures/); anything else isn't offered in the editor and is never filled in. A variable with a
// `fallback` isn't on every page (e.g. company: the Sales Navigator lead page has it, a search result
// doesn't), so templates must say what to use instead -- {company|your team} -- and `fallback` is
// the suggestion the editor offers.
(() => {
  const NAME = { key: 'name', label: 'First name', example: 'Alexandra' };
  const FULL_NAME = { key: 'fullName', label: 'Full name', example: 'Alexandra Smith' };
  const COMPANY = { key: 'company', label: 'Company', example: 'Acme', fallback: 'your team' };
  const TITLE = { key: 'title', label: 'Job title', example: 'Head of Sales', fallback: 'your role' };

  // {variable}, {variable:casing} or {variable|fallback}; groups are variable, casing, fallback
  CN.VARIABLE_PATTERN = /\{(\w+)(?::(\w+))?(?:\|([^{}]*))?\}/g;

  CN.TEMPLATE_TYPES = {
    connection_note: {
      label: 'Connection note',
      mode: 'auto',
      fields: ['body'],
      // LinkedIn's limit; the Sales Navigator box also has maxlength="300"
      maxLength: { body: 300 },
      variables: [NAME, FULL_NAME, COMPANY, TITLE],
    },
    inmail: {
      label: 'InMail',
      mode: 'auto',
      fields: ['subject', 'body'],
      maxLength: {},
      variables: [NAME, FULL_NAME, COMPANY, TITLE],
    },
    message: {
      label: 'Message',
      mode: 'picker',
      fields: ['body'],
      maxLength: {},
      // The name is read from the conversation around the message box; the panel shows who it
      // found ("To: ...") so it can be checked before sending. Company and title are remembered
      // from the person's profile or lead page, or typed into the panel.
      variables: [NAME, FULL_NAME, COMPANY, TITLE],
    },
  };

  // Variables in a template that its type can't fill, e.g. ['company']
  CN.unsupportedVariables = (type, ...texts) => {
    const known = new Set(CN.TEMPLATE_TYPES[type].variables.map((v) => v.key.toLowerCase()));
    const used = texts.join(' ').matchAll(CN.VARIABLE_PATTERN);
    return [...new Set([...used].map((m) => m[1]).filter((key) => !known.has(key.toLowerCase())))];
  };

  // Variables used without the fallback their type requires, e.g. {company} rather than {company|your team}
  CN.missingFallbacks = (type, ...texts) => {
    const needed = new Map(
      CN.TEMPLATE_TYPES[type].variables.filter((v) => v.fallback).map((v) => [v.key.toLowerCase(), v])
    );
    const used = [...texts.join(' ').matchAll(CN.VARIABLE_PATTERN)];
    return [...new Set(used.filter((m) => m[3] === undefined && needed.has(m[1].toLowerCase())).map((m) => needed.get(m[1].toLowerCase())))];
  };
})();
