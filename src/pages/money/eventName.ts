/**
 * A course as a person says it, not as a registrar writes it (2026-09-22).
 *
 * The diary hands over titles like "STRATEGIES FOR COMPETING IN INDUSTRIES AND MARKETS
 * (Ses. 8) Live in-person". Twenty-two of those shouted down the Plan page in capitals,
 * which the register forbids even as a label, and the session number and the delivery mode
 * are a timetable's business, not a ledger's. Pure.
 */

/** "(Ses. 8)", "Ses. 8", "SES 8" and the delivery words the feed appends. */
const SESSION = /\s*[([]?\s*ses\.?\s*\d+(?:\s*[-–]\s*\d+)?\s*[)\]]?/gi;
const DELIVERY = /\s*\b(live in[\s-]?person|in[\s-]?person|asynchronous|synchronous|online|hybrid|remote)\b/gi;
const SHOUTING = /^[^a-z]*$/;

/* Short all-capital words that are names, not shouting: a school, a department, a subject. */
const JOINERS = new Set(['and', 'the', 'for', 'in', 'of', 'to', 'a', 'on', 'at', 'by', 'or']);
/* Two or three letters: IE, MBA, HR, AI. Four would keep DATA capitalised. */
const isAcronym = (word: string) => word.length >= 2 && word.length <= 3 && /^[A-Z]+$/.test(word) && !JOINERS.has(word.toLowerCase());

/** Sentence case, keeping what is already capitalised inside a normal title. */
function unshout(words: string): string {
  if (!SHOUTING.test(words)) return words;
  /* IE-CHALLENGE is not shouting the word "ie": an acronym keeps its capitals. */
  const said = words.toLowerCase().replace(/[A-Za-z]+/g, (word, at) => {
    const original = words.slice(at, at + word.length);
    return isAcronym(original) ? original : word;
  });
  return said.charAt(0).toUpperCase() + said.slice(1);
}

export function eventName(title: string | null | undefined, { max = 46 } = {}): string {
  const raw = String(title || '').trim();
  if (!raw) return '';
  const trimmed = raw.replace(SESSION, ' ').replace(DELIVERY, ' ').replace(/\s{2,}/g, ' ').replace(/[\s,;·-]+$/, '').trim();
  const said = unshout(trimmed || raw);
  /* A row carries one line; a title longer than that is cut at a word. */
  if (said.length <= max) return said;
  const cut = said.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;·-]+$/, '')}…`;
}
