/**
 * Two tabs must not sign each other out.
 * ======================================
 * /refresh rotates the refresh token on every call and holds an optimistic lock, so of two
 * calls carrying the same cookie one wins and the other got 401. The browser keeps one
 * cookie jar for every tab, so three tabs open on twinme.me raced on reload and two of them
 * were told their session was invalid; the page then latched `refreshDisabledForSession`
 * and dropped to sign-in. Reproduced on production 2026-09-25: two concurrent POSTs to
 * /api/auth/refresh returned 200 and 401.
 *
 * Rotation is worth keeping, so the row remembers the hash it just replaced and when. A
 * token presented moments after its own rotation is the same device asking twice, and is
 * answered with a fresh access token and no new cookie, because the jar already holds the
 * winner's. The same token presented long after is reuse of a dead credential, which is
 * what rotation exists to catch, and it revokes the session rather than merely refusing.
 */
import { describe, it, expect } from 'vitest';
import { rotationVerdict, ROTATION_GRACE_MS } from '../../../../api/_app/services/auth/refreshRotation.js';

const now = new Date('2026-09-25T10:00:00Z');
const ago = (ms) => new Date(now.getTime() - ms).toISOString();
const row = (over = {}) => ({
  id: 'r1', user_id: 'u1', token_hash: 'current', previous_token_hash: null, rotated_at: null,
  expires_at: new Date(now.getTime() + 86400000).toISOString(), ...over,
});

describe('rotationVerdict', () => {
  it('rotates the token the row is holding', () => {
    expect(rotationVerdict({ row: row(), presented: 'current', now })).toEqual({ action: 'rotate' });
  });

  it('refuses a row the clock has passed, whichever hash was presented', () => {
    const dead = row({ expires_at: ago(1000), previous_token_hash: 'old', rotated_at: ago(1000) });
    expect(rotationVerdict({ row: dead, presented: 'current', now })).toEqual({ action: 'expired' });
    expect(rotationVerdict({ row: dead, presented: 'old', now })).toEqual({ action: 'expired' });
  });

  it('answers the tab that lost the race, without touching the cookie', () => {
    const raced = row({ previous_token_hash: 'old', rotated_at: ago(5000) });
    expect(rotationVerdict({ row: raced, presented: 'old', now })).toEqual({ action: 'grace' });
  });

  it('holds the door open for exactly the grace window, and not past it', () => {
    const at = (ms) => rotationVerdict({ row: row({ previous_token_hash: 'old', rotated_at: ago(ms) }), presented: 'old', now });
    expect(at(ROTATION_GRACE_MS - 1).action).toBe('grace');
    expect(at(ROTATION_GRACE_MS).action).toBe('grace');
    expect(at(ROTATION_GRACE_MS + 1).action).toBe('reuse');
  });

  it('treats a long-dead token as reuse, which revokes rather than refuses', () => {
    const stale = row({ previous_token_hash: 'old', rotated_at: ago(3600000) });
    expect(rotationVerdict({ row: stale, presented: 'old', now })).toEqual({ action: 'reuse' });
  });

  it('knows nothing about a hash the row never carried', () => {
    expect(rotationVerdict({ row: row(), presented: 'stranger', now })).toEqual({ action: 'unknown' });
    expect(rotationVerdict({ row: row({ previous_token_hash: 'old', rotated_at: ago(5000) }), presented: 'stranger', now })).toEqual({ action: 'unknown' });
  });

  it('cannot be fooled by a row with a previous hash but no rotation time', () => {
    expect(rotationVerdict({ row: row({ previous_token_hash: 'old', rotated_at: null }), presented: 'old', now })).toEqual({ action: 'reuse' });
  });

  it('has no verdict without a row', () => {
    expect(rotationVerdict({ row: null, presented: 'current', now })).toEqual({ action: 'unknown' });
  });

  it('prefers the live hash when a row somehow carries it in both places', () => {
    const odd = row({ previous_token_hash: 'current', rotated_at: ago(5000) });
    expect(rotationVerdict({ row: odd, presented: 'current', now })).toEqual({ action: 'rotate' });
  });
});
