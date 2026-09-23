/**
 * ElevenLabs post-call webhook signatures: `ElevenLabs-Signature: t=<unix>,v0=<hex>`,
 * HMAC-SHA256 over `${t}.${rawBody}`, rejected when older than 30 minutes.
 */
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyElevenLabsSignature, ELEVENLABS_SIGNATURE_MAX_AGE_MS } from '../../api/_app/services/elevenlabsWebhook.js';

const SECRET = 'whsec_test';
const body = JSON.stringify({ type: 'post_call_transcription', data: { conversation_id: 'conv-1' } });
const now = new Date('2026-09-16T12:00:00Z');
const sign = (t, secret = SECRET) => `v0=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
const ts = Math.floor(now.getTime() / 1000);

describe('verifyElevenLabsSignature', () => {
  it('accepts a fresh, correctly signed body', () => {
    expect(verifyElevenLabsSignature(body, `t=${ts},${sign(ts)}`, SECRET, now)).toBe(true);
  });

  it('rejects a body signed with another secret', () => {
    expect(verifyElevenLabsSignature(body, `t=${ts},${sign(ts, 'other')}`, SECRET, now)).toBe(false);
  });

  it('rejects a body that changed after signing', () => {
    expect(verifyElevenLabsSignature(body + ' ', `t=${ts},${sign(ts)}`, SECRET, now)).toBe(false);
  });

  it('rejects a signature older than thirty minutes', () => {
    const old = ts - Math.floor(ELEVENLABS_SIGNATURE_MAX_AGE_MS / 1000) - 1;
    expect(verifyElevenLabsSignature(body, `t=${old},${sign(old)}`, SECRET, now)).toBe(false);
  });

  it('accepts when any of several v0 values matches', () => {
    expect(verifyElevenLabsSignature(body, `t=${ts},v0=deadbeef,${sign(ts)}`, SECRET, now)).toBe(true);
  });

  it('rejects a missing or malformed header', () => {
    expect(verifyElevenLabsSignature(body, undefined, SECRET, now)).toBe(false);
    expect(verifyElevenLabsSignature(body, 'nonsense', SECRET, now)).toBe(false);
    expect(verifyElevenLabsSignature(body, `t=${ts}`, SECRET, now)).toBe(false);
  });
});
