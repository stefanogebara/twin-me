/**
 * The state a bank's redirect carries back: the user, signed, and the page to come back to.
 * The bank calls the callback without our session, so this is the only thing that says who
 * the consent belongs to. Only a path under /money may be a way back: a forged state cannot
 * send a person elsewhere, and an unknown one lands on Sources. Pure but for the secret.
 */
import crypto from 'node:crypto';

export const BACK_PATHS = Object.freeze(['/money', '/money/you', '/money/month', '/money/plan', '/money/chat']);

/**
 * The secret, or nothing. This signed with 'dev' whenever JWT_SECRET was unset, so in any
 * environment without the secret -- a preview deployment, a misconfigured worker -- a forged
 * state could attach a bank consent to an arbitrary person. A missing secret is now a
 * refusal to sign at all, and a secret that is the old fallback's own word is treated as
 * missing, so the fallback cannot come back in through the environment (2026-09-19).
 */
function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value === 'dev') throw new Error('JWT_SECRET is not configured; the bank state cannot be signed');
  return value;
}

export function signState(userId, back = '') {
  const nonce = crypto.randomBytes(8).toString('base64url');
  const where = BACK_PATHS.includes(back) ? Buffer.from(back).toString('base64url') : '';
  const body = `${userId}.${nonce}.${where}`;
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** { userId, back } for a state this server signed; null for anything else, including
    a state that arrives while there is no secret to check it against. */
export function readState(state) {
  const parts = String(state || '').split('.');
  if (parts.length !== 4) return null;
  let key;
  try { key = secret(); } catch { return null; }
  const body = `${parts[0]}.${parts[1]}.${parts[2]}`;
  const sig = Buffer.from(crypto.createHmac('sha256', key).update(body).digest('base64url'));
  const given = Buffer.from(String(parts[3]));
  /* Compared in constant time: !== stops at the first differing byte and says how far it got. */
  if (sig.length !== given.length || !crypto.timingSafeEqual(sig, given)) return null;
  const back = parts[2] ? Buffer.from(parts[2], 'base64url').toString('utf8') : '';
  return { userId: parts[0], back: BACK_PATHS.includes(back) ? back : '/money/you' };
}
