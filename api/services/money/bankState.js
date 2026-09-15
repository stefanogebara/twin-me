/**
 * The state a bank's redirect carries back: the user, signed, and the page to come back to.
 * The bank calls the callback without our session, so this is the only thing that says who
 * the consent belongs to. Only a path under /money may be a way back: a forged state cannot
 * send a person elsewhere, and an unknown one lands on Sources. Pure but for the secret.
 */
import crypto from 'node:crypto';

export const BACK_PATHS = Object.freeze(['/money', '/money/you', '/money/month', '/money/plan', '/money/chat']);
const secret = () => process.env.JWT_SECRET || 'dev';

export function signState(userId, back = '') {
  const nonce = crypto.randomBytes(8).toString('base64url');
  const where = BACK_PATHS.includes(back) ? Buffer.from(back).toString('base64url') : '';
  const body = `${userId}.${nonce}.${where}`;
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** { userId, back } for a state this server signed; null for anything else. */
export function readState(state) {
  const parts = String(state || '').split('.');
  if (parts.length !== 4) return null;
  const body = `${parts[0]}.${parts[1]}.${parts[2]}`;
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (sig !== parts[3]) return null;
  const back = parts[2] ? Buffer.from(parts[2], 'base64url').toString('utf8') : '';
  return { userId: parts[0], back: BACK_PATHS.includes(back) ? back : '/money/you' };
}
