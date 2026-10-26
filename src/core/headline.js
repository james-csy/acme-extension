// Company and job title from a LinkedIn headline or card line, e.g. "Head of Sales @ Acme | Ex-Google"
// or "Current: Account Executive at Gong". Headlines are free text, so this only answers when the
// pattern is unmistakable and returns null otherwise: a missing company falls back to the
// template's "your team", a wrong one ends up in a message to a prospect.
//   - "@Acme" / "@ Acme": anywhere, unless it's an old job ("Ex-", "Former", "Previously", "Past");
//     lowercase ("@hubspot") only after a job title, so a Twitter handle isn't taken for a company
//   - "at Acme": only lowercase "at" (or "At" in Title Case headlines) right after a job title,
//     so "Great at building teams", "Expert at Salesforce" and "looking at New Roles" give nothing
//   - the name is the run of capitalised words after it ("Bank of America", "Johnson & Johnson",
//     "AT&T"), up to 5 words, ending at | · • , ( and the like
//   - placeholders ("Stealth", "Self-employed", "Freelance") and phrases ("at Scale", "at Heart")
//     give nothing
(() => {
  // Pieces of a headline that each describe one thing: "Founder @Acme | Advisor @Beta"
  const SEGMENTS = /\s*(?:\||•|·|;|\/|\n|\s[-–—]\s)\s*/;
  const OLD_JOB = /\b(ex|former|formerly|previously|prev|past|retired)\b/i;
  // A job title has one of these words
  const ROLE = new RegExp(
    '\\b(' +
      [
        'founder', 'co-?founder', 'owner', 'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cro', 'cpo', 'chief', 'president',
        'vp', 'svp', 'evp', 'avp', 'gm', 'vice president', 'head', 'director', 'manager', 'lead', 'leader',
        'engineer', 'developer', 'designer', 'architect', 'analyst', 'scientist', 'researcher', 'consultant',
        'advisor', 'adviser', 'partner', 'principal', 'associate', 'specialist', 'executive', 'officer',
        'ae', 'sdr', 'bdr', 'representative', 'rep', 'recruiter', 'strategist', 'marketer', 'marketing',
        'sales', 'product', 'operations', 'ops', 'account', 'accounts', 'growth', 'investor', 'intern',
        'student', 'professor', 'teacher', 'coach', 'coordinator', 'administrator', 'assistant', 'editor',
        'writer', 'producer', 'attorney', 'lawyer', 'counsel', 'staff', 'member', 'board',
      ].join('|') +
      ')\\b',
    'i'
  );
  // Not a company, or not one worth putting in a message
  const NOT_COMPANY = new Set([
    'stealth', 'stealth startup', 'stealth mode', 'a stealth startup', 'self-employed', 'self employed',
    'freelance', 'freelancer', 'independent', 'confidential', 'various', 'retired', 'unemployed',
    'open to work', 'hiring', 'n/a', 'none', 'home', 'my own company', 'startup', 'a startup',
  ]);
  // "at Scale", "at Heart": phrases, not companies
  const PHRASE_START = new Set([
    'scale', 'heart', 'home', 'work', 'night', 'large', 'all', 'the', 'best', 'least', 'first', 'last',
    'once', 'times', 'hand', 'risk', 'speed', 'any', 'every', 'some', 'my', 'your', 'our', 'their', 'his',
    'her', 'its', 'this', 'that', 'a', 'an', 'it',
  ]);
  // Lowercase words allowed inside a name, between capitalised ones
  const JOINERS = new Set(['of', 'and', '&', 'de', 'the', 'for', 'la', 'le', 'du', 'von', 'van', 'y', 'e', 'da', 'del']);
  const capitalised = (word) => /^[\p{Lu}\p{N}]/u.test(word || '');

  // The company name at the start of `text`: its leading run of capitalised words. After "@" the
  // first word may be lowercase ("@hubspot"). "The" starts a name ("The Trade Desk") except in Title
  // Case headlines, where "At The Intersection Of..." is more likely.
  function leadingName(text, allowLowercaseStart, titleCase = false) {
    const words = text
      .split(/[,(!?:"“”]/)[0]
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const name = [];
    for (let i = 0; i < words.length; i += 1) {
      const word = words[i];
      const ok =
        i === 0
          ? capitalised(word) || (allowLowercaseStart && /^[\p{L}\p{N}]/u.test(word))
          : capitalised(word) || (JOINERS.has(word.toLowerCase()) && capitalised(words[i + 1]));
      if (!ok) break;
      name.push(word);
    }
    if (!name.length || name.length > 5) return null;
    // Trailing punctuation and emoji: "Acme." -> "Acme"
    const company = name.join(' ').replace(/[^\p{L}\p{N})&+]+$/u, '');
    const first = name[0].toLowerCase();
    if (!company || NOT_COMPANY.has(company.toLowerCase())) return null;
    if (PHRASE_START.has(first) && !(first === 'the' && !titleCase && name.length > 1)) return null;
    return company;
  }

  // The job title before "@"/"at": the part of the clause after any "Current:" style label, without
  // "now", "currently", "I'm"
  const titleFrom = (before) => {
    const title = before
      .split(/[,:]/)
      .pop()
      .replace(/^[^\p{L}]+/u, '')
      .replace(/^(now|currently|i'?m|i am)\s+/i, '')
      .trim();
    return title && ROLE.test(title) && title.split(/\s+/).length <= 6 ? title : null;
  };

  function readSegment(segment) {
    // "@Acme", "@ Acme" (not an email or a handle glued to a word)
    const at = segment.match(/(^|\s)@\s?(\S.*)$/);
    if (at) {
      const before = segment.slice(0, at.index);
      if (OLD_JOB.test(before.split(/[,;]/).pop())) return null;
      // A lowercase name only after a job title: "Founder @hubspot", not "Tweets @jsmith"
      const company = leadingName(at[2], ROLE.test(before));
      return company && { company, title: titleFrom(before) };
    }
    // "Head of Sales at Acme": "at" right after a job title (within its last 4 words), and not
    // "looking at" / "working at"
    const word = segment.match(/^(.*?\S)\s+(at|At)\s+(\S.*)$/);
    if (!word) return null;
    const before = word[1];
    const clause = before.split(/[,;]/).pop();
    const lastWords = clause.trim().split(/\s+/);
    const last = lastWords.at(-1);
    const verb = /ing$/i.test(last) && !ROLE.test(last); // "looking at", but not "VP Marketing at"
    if (OLD_JOB.test(clause) || verb || !ROLE.test(lastWords.slice(-4).join(' '))) return null;
    const company = leadingName(word[3], false, word[2] === 'At');
    return company && { company, title: titleFrom(before) };
  }

  // { company, title } (title may be null), or null when the headline doesn't clearly say
  CN.companyFromHeadline = (headline) => {
    if (!headline) return null;
    for (const segment of headline.split(SEGMENTS)) {
      const found = segment && readSegment(segment.trim());
      if (found) return found;
    }
    return null;
  };
})();
