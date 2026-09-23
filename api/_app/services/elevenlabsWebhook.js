/**
 * ElevenLabs webhook signatures.
 *
 * Header `ElevenLabs-Signature: t=<unix seconds>,v0=<hex>[,v0=<hex>...]`;
 * the hex is HMAC-SHA256 of `${t}.${rawBody}` with the webhook's secret. A
 * timestamp older than thirty minutes is refused (replay), and the body must
 * be the raw bytes, never a re-serialized object. Pure: the caller passes
 * `now` so the age check is testable.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const ELEVENLABS_SIGNATURE_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * @param {string} rawBody
 * @param {string | undefined} header  the ElevenLabs-Signature header
 * @param {string} secret
 * @param {Date} [now]
 * @returns {boolean}
 */
export function verifyElevenLabsSignature(rawBody, header, secret, now = new Date()) {
  if (typeof rawBody !== 'string' || typeof header !== 'string' || !secret) return false;
  const parts = header.split(',').map((p) => p.trim());
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2);
  const signatures = parts.filter((p) => p.startsWith('v0=')).map((p) => p.slice(3));
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  const age = now.getTime() - Number(timestamp) * 1000;
  if (age > ELEVENLABS_SIGNATURE_MAX_AGE_MS || age < -ELEVENLABS_SIGNATURE_MAX_AGE_MS) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  return signatures.some((sig) => {
    const buf = Buffer.from(sig, 'utf8');
    return buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf);
  });
}
