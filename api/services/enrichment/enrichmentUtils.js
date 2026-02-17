/**
 * Enrichment Utility Functions
 *
 * Name inference from email addresses and domain-based company enrichment.
 * These are pure functions with no external dependencies.
 */

/**
 * Infer a full name from an email address.
 * Handles many real-world patterns:
 *   "stefanogebara@gmail.com"     -> "Stefano Gebara"
 *   "john.doe@company.com"        -> "John Doe"
 *   "jane_smith123@mail.com"      -> "Jane Smith"
 *   "j.doe@work.com"              -> "J Doe"
 *   "mr.john.doe@mail.com"        -> "John Doe"
 *   "JohnDoe@gmail.com"           -> "John Doe"
 *   "john.doe.jr@gmail.com"       -> "John Doe Jr"
 *   "info@acme-corp.com"          -> "Acme Corp" (generic -> domain)
 *   "jean-pierre.dupont@mail.com" -> "Jean-Pierre Dupont"
 */
export function inferNameFromEmail(email) {
  const [local, domain] = email.split('@');

  // Generic/role prefixes -- fall back to domain name
  const genericPrefixes = new Set([
    'info', 'admin', 'hello', 'contact', 'support', 'noreply', 'no-reply',
    'sales', 'team', 'office', 'mail', 'webmaster', 'postmaster', 'help',
    'billing', 'accounts', 'enquiries', 'service', 'marketing', 'press',
  ]);
  if (genericPrefixes.has(local.toLowerCase())) {
    const domainName = (domain || '').split('.')[0];
    return domainName
      .replace(/[_-]/g, ' ')
      .split(/\s+/)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(' ');
  }

  const honorifics = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sir', 'rev']);
  const nameSuffixes = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md', 'esq']);

  // Detect separators
  const hasSeparators = /[._]/.test(local);
  let tokens;

  if (hasSeparators) {
    // "john.doe", "jane_smith", "jean-pierre.dupont" -> split on dots/underscores, preserve hyphens
    tokens = local.split(/[._]/).filter(t => t.length > 0);
  } else {
    // No separators: camelCase split
    let expanded = local
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    tokens = expanded.split(/\s+/).filter(t => t.length > 0);
  }

  // Clean tokens -- strip numbers
  tokens = tokens
    .map(t => t.replace(/^\d+|\d+$/g, ''))
    .map(t => t.replace(/\d+/g, ''))
    .filter(t => t.length > 0);

  // Strip honorific prefixes
  if (tokens.length > 1 && honorifics.has(tokens[0].toLowerCase())) {
    tokens = tokens.slice(1);
  }

  // Capitalize properly
  const capitalize = (s) => {
    return s.split('-').map(part =>
      part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    ).join('-');
  };

  const result = tokens.map((t) => {
    const lower = t.toLowerCase();
    if (nameSuffixes.has(lower)) {
      if (lower === 'ii' || lower === 'iii' || lower === 'iv') return t.toUpperCase();
      return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    }
    if (t.length === 1) return t.toUpperCase();
    return capitalize(t);
  });

  if (result.length === 0) {
    return local.charAt(0).toUpperCase() + local.slice(1);
  }

  return result.join(' ');
}

/**
 * Domain enrichment: extract company name from corporate email domains.
 * FREE, instant, zero API calls. Returns null for free email providers.
 */
export function enrichFromDomain(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  const freeProviders = new Set([
    'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com',
    'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'icloud.com', 'me.com', 'mac.com',
    'protonmail.com', 'proton.me', 'aol.com', 'zoho.com', 'mail.com',
    'gmx.com', 'gmx.net', 'fastmail.com', 'tutanota.com', 'hey.com',
  ]);

  if (freeProviders.has(domain)) return null;

  const companyName = domain.split('.')[0]
    .replace(/[-_]/g, ' ')
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return { discovered_company: companyName, company_domain: domain };
}

/**
 * Verify that a profile name matches the searched name.
 * Handles variations like "Satya Nadella" vs "Satya N." or "S. Nadella"
 */
export function verifyNameMatch(profileName, searchName) {
  if (!profileName || !searchName) return false;

  // Normalize names: lowercase, remove extra spaces
  const normalize = (name) => name.toLowerCase().trim().replace(/\s+/g, ' ');
  const profile = normalize(profileName);
  const search = normalize(searchName);

  // Exact match
  if (profile === search) return true;

  // Check if profile name contains all parts of search name
  const profileParts = profile.split(' ').filter(p => p.length > 1);
  const searchParts = search.split(' ').filter(p => p.length > 1);

  // If search has company/title (e.g., "Jensen Huang NVIDIA"), extract just the name
  const searchNameOnly = searchParts.filter(p =>
    !['ceo', 'cto', 'cfo', 'founder', 'president', 'chairman', 'director',
     'nvidia', 'apple', 'google', 'microsoft', 'meta', 'amazon', 'tesla'].includes(p)
  );

  // Check if first and last name match (allowing for middle names)
  if (searchNameOnly.length >= 2 && profileParts.length >= 2) {
    const firstNameMatch = profileParts[0] === searchNameOnly[0] ||
                           profileParts[0].startsWith(searchNameOnly[0].charAt(0));
    const lastNameMatch = profileParts[profileParts.length - 1] === searchNameOnly[searchNameOnly.length - 1];

    if (firstNameMatch && lastNameMatch) return true;
  }

  // Check if either name contains the other (handles "Tim Cook" matching "Timothy Cook")
  if (profile.includes(searchNameOnly.join(' ')) || searchNameOnly.join(' ').includes(profile)) {
    return true;
  }

  // Check first name and last name separately
  if (searchNameOnly.length >= 1 && profileParts.length >= 1) {
    const searchFirst = searchNameOnly[0];
    const searchLast = searchNameOnly[searchNameOnly.length - 1];
    const profileFirst = profileParts[0];
    const profileLast = profileParts[profileParts.length - 1];

    // First names match (or one is abbreviation of other)
    const firstMatch = profileFirst === searchFirst ||
                       profileFirst.startsWith(searchFirst) ||
                       searchFirst.startsWith(profileFirst);

    // Last names match
    const lastMatch = profileLast === searchLast;

    if (firstMatch && lastMatch) return true;
  }

  console.log(`[ProfileEnrichment] Name verification failed: "${profileName}" vs "${searchName}"`);
  return false;
}

/**
 * Validate a URL belongs to expected domain
 */
export function validateUrl(url, expectedDomain) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes(expectedDomain)) {
      return url;
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/**
 * Extract URL using regex
 */
export function extractUrl(text, pattern) {
  const match = text.match(pattern);
  return match ? match[0] : null;
}
