/**
 * What a presented refresh token means, when rotation is in play.
 * ===============================================================
 * /refresh rotates on every call under an optimistic lock, so of two calls carrying the same
 * cookie one won and the other was told its session was invalid. A browser keeps one cookie
 * jar for every tab, so tabs raced each other on reload: reproduced on production
 * 2026-09-25, two concurrent POSTs answering 200 and 401. The losing tab then latched
 * `refreshDisabledForSession` and fell to sign-in, and the person read that as being logged
 * out every time they refreshed.
 *
 * Rotation is worth keeping -- it is what turns a stolen refresh token into a detectable
 * event -- so the row remembers the hash it just replaced and the moment it did. Then:
 *
 *   rotate   the row still holds this hash: the ordinary path, issue a new pair
 *   grace    this hash was replaced moments ago: the same device asking twice. Issue an
 *            access token and leave the cookie alone, because the jar already holds the
 *            winner's. Nothing is rotated, so a third tab is answered the same way.
 *   reuse    this hash was replaced long ago: a dead credential is being presented, which
 *            is the case rotation exists to catch. Revoke the session rather than refuse it.
 *   expired  the row is past its own expiry, whatever was presented.
 *   unknown  the row never carried this hash.
 *
 * Pure: a row and a hash in, a verdict out; the route applies it.
 */

/* Long enough for a slow tab on a slow phone to finish a request that started before the
   winner's write landed, short enough that a stolen token is not useful. */
export const ROTATION_GRACE_MS = 60 * 1000;

export function rotationVerdict({ row, presented, now = new Date() }) {
  if (!row || !presented) return { action: 'unknown' };
  const at = now instanceof Date ? now.getTime() : new Date(now).getTime();

  const expiresAt = Date.parse(row.expires_at);
  if (Number.isFinite(expiresAt) && expiresAt < at) return { action: 'expired' };

  /* The live hash wins over the remembered one: a row carrying the same hash in both places
     is still holding it, and rotating is the honest answer. */
  if (row.token_hash && presented === row.token_hash) return { action: 'rotate' };

  if (row.previous_token_hash && presented === row.previous_token_hash) {
    const rotatedAt = Date.parse(row.rotated_at);
    /* A remembered hash with no moment attached cannot be shown to be recent, and a token
       that cannot be shown to be recent is treated as dead. */
    if (!Number.isFinite(rotatedAt)) return { action: 'reuse' };
    return at - rotatedAt <= ROTATION_GRACE_MS ? { action: 'grace' } : { action: 'reuse' };
  }

  return { action: 'unknown' };
}
