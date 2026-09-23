/**
 * Username Uniqueness Filter
 * Determines if a username is specific enough to cascade across platforms.
 * Prevents false positives from common names like "john", "admin", "test".
 */

// Top 200 most common English first names (lowercase)
const COMMON_NAMES = new Set([
  'james', 'john', 'robert', 'michael', 'david', 'william', 'richard', 'joseph',
  'thomas', 'charles', 'christopher', 'daniel', 'matthew', 'anthony', 'mark',
  'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian',
  'george', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey', 'ryan', 'jacob',
  'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott',
  'brandon', 'benjamin', 'samuel', 'raymond', 'gregory', 'frank', 'alexander',
  'patrick', 'jack', 'dennis', 'jerry', 'tyler', 'aaron', 'jose', 'adam', 'nathan',
  'henry', 'peter', 'zachary', 'douglas', 'harold', 'kyle', 'noah', 'carl',
  'mary', 'patricia', 'jennifer', 'linda', 'barbara', 'elizabeth', 'susan',
  'jessica', 'sarah', 'karen', 'lisa', 'nancy', 'betty', 'margaret', 'sandra',
  'ashley', 'dorothy', 'kimberly', 'emily', 'donna', 'michelle', 'carol',
  'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura',
  'cynthia', 'kathleen', 'amy', 'angela', 'shirley', 'anna', 'brenda', 'pamela',
  'emma', 'nicole', 'helen', 'samantha', 'katherine', 'christine', 'debra',
  'rachel', 'carolyn', 'janet', 'catherine', 'maria', 'heather', 'diane', 'ruth',
  'julie', 'olivia', 'joyce', 'virginia', 'victoria', 'kelly', 'lauren', 'christina',
  'joan', 'evelyn', 'judith', 'megan', 'andrea', 'cheryl', 'hannah', 'jacqueline',
  'martha', 'gloria', 'teresa', 'ann', 'sara', 'madison', 'frances', 'kathryn',
  'janice', 'jean', 'abigail', 'alice', 'judy', 'sophia', 'grace', 'denise',
  'amber', 'doris', 'marilyn', 'danielle', 'beverly', 'isabella', 'theresa',
  'diana', 'natalie', 'brittany', 'charlotte', 'marie', 'kayla', 'alexis', 'lori',
  // Common tech/test usernames
  'admin', 'test', 'user', 'guest', 'root', 'info', 'contact', 'support',
  'help', 'demo', 'example', 'mail', 'webmaster', 'postmaster', 'hello',
]);

/**
 * Check if a username is unique enough to cascade across 600+ platforms.
 * Returns false for common names, short strings, and numeric-only usernames.
 *
 * @param {string} username
 * @returns {boolean}
 */
export function isUsernameCascadeable(username) {
  if (!username || typeof username !== 'string') return false;

  const clean = username.toLowerCase().trim();

  // Too short — high false positive rate
  if (clean.length < 4) return false;

  // Numeric only — not a real username
  if (/^\d+$/.test(clean)) return false;

  // Common first name — matches everywhere
  if (COMMON_NAMES.has(clean)) return false;

  // Email-style prefix that's just a first name (e.g., "stefano" from stefano@...)
  // Allow compound usernames like "stefanogebara", "john_doe123"
  if (clean.length < 6 && COMMON_NAMES.has(clean)) return false;

  return true;
}
