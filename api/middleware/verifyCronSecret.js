/**
 * Cron Secret Verification Middleware
 *
 * Uses crypto.timingSafeEqual() to prevent timing attacks when comparing
 * the CRON_SECRET. A timing attack could allow an attacker to guess the
 * secret one character at a time by measuring response times.
 *
 * Usage:
 *   import { verifyCronSecret } from '../middleware/verifyCronSecret.js';
 *
 *   // In a route handler:
 *   const authResult = verifyCronSecret(req);
 *   if (!authResult.authorized) {
 *     return res.status(authResult.status).json({ error: authResult.error });
 *   }
 */

import crypto from 'crypto';

/**
 * Verify cron secret from request headers using timing-safe comparison.
 *
 * Accepts the secret in two formats:
 *   - `Authorization: Bearer <secret>`
 *   - `x-vercel-cron-secret: <secret>` (Vercel's native header)
 *
 * @param {import('express').Request} req - Express request object
 * @returns {{ authorized: boolean, status?: number, error?: string }}
 */
export function verifyCronSecret(req) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (isDevelopment) {
    return { authorized: true };
  }

  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return {
      authorized: false,
      status: 500,
      error: 'CRON_SECRET not configured in production',
    };
  }

  // Accept secret from either header
  const authHeader = req.headers.authorization;
  const vercelHeader = req.headers['x-vercel-cron-secret'];

  // Extract the raw secret value from whichever header is present
  let providedSecret = null;

  if (vercelHeader) {
    providedSecret = vercelHeader;
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    providedSecret = authHeader.slice(7); // strip "Bearer "
  } else if (authHeader) {
    // Some files sent the raw secret without Bearer prefix
    providedSecret = authHeader;
  }

  if (!providedSecret) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized',
    };
  }

  // Timing-safe comparison to prevent timing attacks
  if (!timingSafeEqual(providedSecret, expectedSecret)) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized',
    };
  }

  return { authorized: true };
}

/**
 * Timing-safe string comparison.
 * Returns false immediately only for length mismatches (which leak no secret
 * information since the attacker already knows the length of their own input).
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}
