/**
 * Plaid Webhook JWS Verifier — audit-2026-05-23 C3
 * ===================================================
 * Implements Plaid's official webhook authentication model:
 *   1. Webhook arrives with `plaid-verification` header = JWT (ES256, JWS).
 *   2. Decode header to get the `kid` (key id).
 *   3. Fetch the JWK via /webhook_verification_key/get (cached 24h).
 *   4. Convert JWK to PEM, verify the JWT signature (ES256).
 *   5. Verify `request_body_sha256` claim matches sha256(raw body).
 *   6. Verify `iat` claim is within 5min skew.
 *
 * Replaces the bespoke `x-plaid-secret` shared-header check, which Plaid
 * does not actually send. Reference: plaid.com/docs/api/webhooks/webhook-verification/
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { webhookVerificationKeyGet } from './plaidClient.js';
import { createLogger } from '../logger.js';

const log = createLogger('plaid-webhook-verifier');

const MAX_IAT_SKEW_SEC = 5 * 60;
const KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const KEY_CACHE_MAX_ENTRIES = 32;

// Map<keyId, { pem, fetchedAt, expired_at }>
const keyCache = new Map();

function cacheGet(keyId) {
  const entry = keyCache.get(keyId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > KEY_CACHE_TTL_MS) {
    keyCache.delete(keyId);
    return null;
  }
  return entry;
}

function cacheSet(keyId, entry) {
  if (keyCache.size >= KEY_CACHE_MAX_ENTRIES) {
    // Evict oldest (Map preserves insertion order)
    const firstKey = keyCache.keys().next().value;
    if (firstKey) keyCache.delete(firstKey);
  }
  keyCache.set(keyId, entry);
}

function jwkToPem(jwk) {
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  return publicKey.export({ type: 'spki', format: 'pem' });
}

/**
 * Verify a Plaid webhook signature against the raw request body.
 *
 * @param {string} rawBody The exact bytes of the request body as Plaid sent
 *   them. Re-stringified JSON will NOT match — capture the stream before
 *   any JSON parsing.
 * @param {string} signedJwt The value of the `plaid-verification` header.
 * @returns {Promise<{ valid: boolean, reason?: string }>}
 */
export async function verifyPlaidWebhook(rawBody, signedJwt) {
  if (typeof rawBody !== 'string' || rawBody.length === 0) {
    return { valid: false, reason: 'empty body' };
  }
  if (typeof signedJwt !== 'string' || signedJwt.length === 0) {
    return { valid: false, reason: 'missing plaid-verification header' };
  }

  // 1. Decode JWT header (no verification yet) to get kid + alg
  let decoded;
  try {
    decoded = jwt.decode(signedJwt, { complete: true });
  } catch {
    return { valid: false, reason: 'jwt decode failed' };
  }
  if (!decoded?.header) return { valid: false, reason: 'malformed jwt' };
  if (decoded.header.alg !== 'ES256') {
    return { valid: false, reason: `unexpected alg: ${decoded.header.alg}` };
  }
  const kid = decoded.header.kid;
  if (!kid) return { valid: false, reason: 'missing kid' };

  // 2. Fetch + cache the JWK
  let entry = cacheGet(kid);
  if (!entry) {
    try {
      const resp = await webhookVerificationKeyGet(kid);
      const key = resp?.key;
      if (!key || key.alg !== 'ES256') {
        return { valid: false, reason: 'invalid jwk from plaid' };
      }
      entry = { pem: jwkToPem(key), fetchedAt: Date.now(), expired_at: key.expired_at || null };
      cacheSet(kid, entry);
    } catch (err) {
      log.warn(`webhook key fetch failed for kid=${kid}: ${err.message}`);
      return { valid: false, reason: 'key fetch failed' };
    }
  }

  // 3. Reject keys that expired more than 24h ago (Plaid grants a 24h grace)
  if (entry.expired_at) {
    const expiredAtMs = new Date(entry.expired_at).getTime();
    if (!Number.isNaN(expiredAtMs) && Date.now() - expiredAtMs > KEY_CACHE_TTL_MS) {
      return { valid: false, reason: 'key past grace window' };
    }
  }

  // 4. Verify signature + iat freshness
  let claims;
  try {
    claims = jwt.verify(signedJwt, entry.pem, {
      algorithms: ['ES256'],
      // jsonwebtoken's `maxAge` only applies when iat is present; Plaid always
      // sets it. Use seconds.
      maxAge: `${MAX_IAT_SKEW_SEC}s`,
    });
  } catch (err) {
    return { valid: false, reason: `signature/iat invalid: ${err.message}` };
  }

  // 5. Verify body hash
  const expected = claims?.request_body_sha256;
  if (typeof expected !== 'string') {
    return { valid: false, reason: 'missing request_body_sha256 claim' };
  }
  const actual = crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(actual, 'utf8'))) {
    return { valid: false, reason: 'body hash mismatch' };
  }

  return { valid: true };
}

/**
 * Test-only escape hatch — clears the in-memory key cache. Avoid using in
 * production; the cache is per-lambda-instance and short-lived anyway.
 */
export function _resetKeyCache() {
  keyCache.clear();
}
