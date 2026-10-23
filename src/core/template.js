// Fills placeholders in a template from a context object such as { name: 'Josh' }.
//   {name}        the value as found (adapters tidy all-caps names: "JOSH" -> "Josh")
//   {name:lower}  josh
//   {name:upper}  JOSH
//   {name:title}  Josh -- first letter of each part capitalised: "jean-luc" -> "Jean-Luc"
//   {company|your team}  the company, or "your team" when the page doesn't show one
// Placeholders are case-insensitive. Text in braces that isn't a known variable is left alone.
(() => {
  const CASINGS = {
    lower: (value) => value.toLowerCase(),
    upper: (value) => value.toUpperCase(),
    title: (value) => value.toLowerCase().replace(/(^|[-'\s])(\p{L})/gu, (_, sep, letter) => sep + letter.toUpperCase()),
  };

  // Used when the context has no value and the template gives no fallback of its own. Fallbacks
  // get the same casing: {name:upper} -> "THERE"
  const FALLBACKS = { name: 'there' };

  // `allowed` (optional) limits which variables are filled; others are left exactly as typed
  function fillTemplate(template, rawContext, allowed = null) {
    // Match variables case-insensitively: {fullName} and {fullname} both work
    const context = Object.fromEntries(Object.entries(rawContext).map(([k, v]) => [k.toLowerCase(), v]));
    const allowedKeys = allowed && new Set(allowed.map((k) => k.toLowerCase()));
    return template.replace(CN.VARIABLE_PATTERN, (match, variable, casing, fallback) => {
      const key = variable.toLowerCase();
      if (allowedKeys && !allowedKeys.has(key)) return match;
      if (!(key in context) && !(key in FALLBACKS) && fallback === undefined) return match;
      const value = context[key] || fallback || FALLBACKS[key] || '';
      const apply = CASINGS[casing?.toLowerCase()];
      return apply ? apply(value) : value;
    });
  }

  // Fills only the variables the template type supports (see src/core/types.js)
  function fillForType(type, template, context) {
    return fillTemplate(template, context, CN.TEMPLATE_TYPES[type].variables.map((v) => v.key));
  }

  Object.assign(CN, { fillTemplate, fillForType });
})();
