/**
 * The distress tripwire (Phase 2, T8).
 * ====================================
 * Words from HER turns that make a call urgent whatever the summarizer's model
 * decided: a fall, strong pain, not breathing well, a cry for help. The model
 * can miss a fall said in passing; this cannot. It reads only what she said,
 * never the presence's own questions ("Você caiu?"), and it never lowers an
 * urgency, only raises it. Pure.
 */

/** A phrase with letter boundaries that know Portuguese ("caí" ends in a letter \b does not see). */
const word = (source) => new RegExp(`(?<!\\p{L})(?:${source})(?!\\p{L})`, 'iu');

/** Ordered most specific first, so the phrase reported is the one that matters. */
const PHRASES = [
  word('n[aã]o consigo respirar'),
  word('falta de ar'),
  word('passando (?:muito )?mal'),
  word('muito mal'),
  word('dor forte'),
  word('muita dor'),
  word('dor no peito'),
  word('ambul[aâ]ncia'),
  word('me ajud[ae]'),
  word('socorro'),
  word('desmai(?:ei|ou|o)'),
  word('sangr(?:ando|ou|a)'),
  word('infarto|derrame|avc'),
  word('press[aã]o (?:muito )?alta'),
  word('tontura forte|muita tontura'),
  // A fall, but not the power, the line or the signal going down.
  word('ca[ií](?! (?:a|o) (?:energia|luz|internet|sinal|linha))'),
  word('caiu(?! (?:a|o) (?:energia|luz|internet|sinal|linha))'),
  word('queda(?! d[aeo] (?:energia|luz|internet|sinal))'),
];

/**
 * @param {Array<{ role: string, content: string }>} transcript
 * @returns {{ hit: boolean, phrase: string | null }}
 */
export function distressTripwire(transcript) {
  for (const turn of Array.isArray(transcript) ? transcript : []) {
    if (turn?.role !== 'user') continue;
    const text = String(turn.content || '');
    for (const re of PHRASES) {
      const m = re.exec(text);
      if (m) return { hit: true, phrase: m[0] };
    }
  }
  return { hit: false, phrase: null };
}
