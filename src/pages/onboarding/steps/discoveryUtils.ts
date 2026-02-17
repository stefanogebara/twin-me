/**
 * Utility functions and animation constants for the DiscoveryStep
 */

// ====================================================================
// ANIMATION VARIANTS
// ====================================================================

export const messageContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

export const messageItemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export const dataFieldContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.2 },
  },
};

export const dataFieldItemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

// ====================================================================
// NAME INFERENCE
// ====================================================================

/**
 * Infer a full name from an email address.
 * Handles many real-world patterns:
 *   "stefanogebara@gmail.com"     → "Stefano Gebara"
 *   "john.doe@company.com"        → "John Doe"
 *   "jane_smith123@mail.com"      → "Jane Smith"
 *   "j.doe@work.com"              → "J Doe"
 *   "mr.john.doe@mail.com"        → "John Doe"
 *   "JohnDoe@gmail.com"           → "John Doe"
 *   "john.doe.jr@gmail.com"       → "John Doe Jr"
 *   "maría.garcía@correo.com"     → "María García"
 *   "info@acme-corp.com"          → "Acme Corp" (generic → domain)
 *   "jean-pierre.dupont@mail.com" → "Jean-Pierre Dupont"
 */
export const inferNameFromEmail = (email: string): string => {
  const [local, domain] = email.split('@');

  // Generic/role prefixes — fall back to domain name
  const genericPrefixes = new Set([
    'info', 'admin', 'hello', 'contact', 'support', 'noreply', 'no-reply',
    'sales', 'team', 'office', 'mail', 'webmaster', 'postmaster', 'help',
    'billing', 'accounts', 'enquiries', 'service', 'marketing', 'press',
  ]);
  if (genericPrefixes.has(local.toLowerCase())) {
    // Use domain: "acme-corp.com" → "Acme Corp"
    const domainName = (domain || '').split('.')[0];
    return domainName
      .replace(/[_-]/g, ' ')
      .split(/\s+/)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(' ');
  }

  // Honorific prefixes and suffixes to strip/preserve
  const honorifics = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sir', 'rev']);
  const nameSuffixes = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md', 'esq']);

  // Step 1: Detect if local part uses separators (dots, underscores)
  const hasSeparators = /[._]/.test(local);

  let tokens: string[];

  if (hasSeparators) {
    // "john.doe", "jane_smith", "j.doe.smith" — split on separators
    // But preserve hyphens within tokens: "jean-pierre.dupont" → ["jean-pierre", "dupont"]
    tokens = local.split(/[._]/).filter(t => t.length > 0);
  } else {
    // No separators: try camelCase split, then consonant-vowel heuristic
    // "JohnDoe" → "John Doe", "stefanogebara" → attempt split
    let expanded = local
      .replace(/([a-z])([A-Z])/g, '$1 $2')   // camelCase: johnDoe → john Doe
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'); // XMLParser → XML Parser
    tokens = expanded.split(/\s+/).filter(t => t.length > 0);
  }

  // Step 2: Clean each token — strip numbers, normalize
  tokens = tokens
    .map(t => t.replace(/^\d+|\d+$/g, ''))   // strip leading/trailing numbers
    .map(t => t.replace(/\d+/g, ''))          // strip embedded numbers
    .filter(t => t.length > 0);

  // Step 3: Strip honorific prefixes
  if (tokens.length > 1 && honorifics.has(tokens[0].toLowerCase())) {
    tokens = tokens.slice(1);
  }

  // Step 4: Capitalize properly
  const capitalize = (s: string): string => {
    // Handle hyphenated names: "jean-pierre" → "Jean-Pierre"
    return s.split('-').map(part =>
      part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    ).join('-');
  };

  const result = tokens.map((t, i) => {
    const lower = t.toLowerCase();
    // Preserve suffixes as-is (Jr, Sr, III)
    if (nameSuffixes.has(lower)) {
      if (lower === 'ii' || lower === 'iii' || lower === 'iv') return t.toUpperCase();
      return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    }
    // Single letter — keep uppercase (initial)
    if (t.length === 1) return t.toUpperCase();
    return capitalize(t);
  });

  if (result.length === 0) {
    return local.charAt(0).toUpperCase() + local.slice(1);
  }

  return result.join(' ');
};

// ====================================================================
// NARRATIVE BUILDER
// ====================================================================

import { EnrichmentData } from '@/services/enrichmentService';

export const buildNarrativeParagraph = (data: EnrichmentData, name: string): string => {
  // Build clean prose sentences — no markdown, no bullets, just flowing text
  const sentences: string[] = [];

  // Identity
  if (data.discovered_title && data.discovered_company) {
    const titleLower = data.discovered_title.toLowerCase();
    const companyLower = data.discovered_company.toLowerCase();
    const loc = data.discovered_location ? `, based in ${data.discovered_location}` : '';
    if (titleLower.includes(companyLower)) {
      sentences.push(`${name} is ${data.discovered_title}${loc}.`);
    } else {
      sentences.push(`${name} is ${data.discovered_title} at ${data.discovered_company}${loc}.`);
    }
  } else if (data.discovered_title) {
    const loc = data.discovered_location ? `, based in ${data.discovered_location}` : '';
    sentences.push(`${name} is ${data.discovered_title}${loc}.`);
  } else if (data.discovered_company) {
    const loc = data.discovered_location ? `, based in ${data.discovered_location}` : '';
    sentences.push(`${name} works at ${data.discovered_company}${loc}.`);
  } else if (data.discovered_location) {
    sentences.push(`${name} is based in ${data.discovered_location}.`);
  }

  // Career (strip markdown, extract clean sentences)
  if (data.career_timeline && data.career_timeline.length > 20) {
    const clean = data.career_timeline
      .replace(/\*\*/g, '')
      .replace(/^[•\-*]\s*/gm, '')
      .replace(/^#+\s*/gm, '')
      .replace(/\[[\d,\s]+\]/g, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const extracted = clean.match(/[^.!?]+[.!?]+/g);
    if (extracted && extracted.length > 0) {
      sentences.push(extracted.slice(0, 2).join(' ').trim());
    }
  }

  // Education (clean)
  if (data.education && data.education.length > 10) {
    const clean = data.education
      .replace(/\*\*/g, '')
      .replace(/^[•\-*]\s*/gm, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean.length > 5) {
      sentences.push(clean.endsWith('.') ? clean : clean + '.');
    }
  }

  // Bio
  if (data.discovered_bio && data.discovered_bio.length > 20) {
    const cleanBio = data.discovered_bio
      .replace(/\*\*/g, '')
      .replace(/^[•\-*]\s*/gm, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanBio.length > 10) {
      sentences.push(cleanBio.endsWith('.') ? cleanBio : cleanBio + '.');
    }
  }

  if (sentences.length === 0) {
    return `I couldn't find much public information about ${name}.`;
  }

  return sentences.join(' ');
};
