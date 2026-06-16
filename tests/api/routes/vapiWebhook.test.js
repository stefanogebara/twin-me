/**
 * Vapi webhook secret verification. Rejects when no secret is configured
 * (feature inert), on a header mismatch, or a length mismatch; accepts the
 * exact configured secret. (handleCallWebhook itself is covered in
 * callService.test.js.)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyVapiSecret } from '../../../api/routes/webhook-vapi.js';

const orig = process.env.VAPI_WEBHOOK_SECRET;
afterEach(() => { if (orig === undefined) delete process.env.VAPI_WEBHOOK_SECRET; else process.env.VAPI_WEBHOOK_SECRET = orig; });

describe('verifyVapiSecret', () => {
  it('rejects when no secret is configured', () => {
    delete process.env.VAPI_WEBHOOK_SECRET;
    expect(verifyVapiSecret({ 'x-vapi-secret': 'anything' })).toBe(false);
  });

  it('rejects a mismatched secret', () => {
    process.env.VAPI_WEBHOOK_SECRET = 'topsecret';
    expect(verifyVapiSecret({ 'x-vapi-secret': 'wrong' })).toBe(false);
  });

  it('rejects a missing header', () => {
    process.env.VAPI_WEBHOOK_SECRET = 'topsecret';
    expect(verifyVapiSecret({})).toBe(false);
  });

  it('accepts the exact configured secret', () => {
    process.env.VAPI_WEBHOOK_SECRET = 'topsecret';
    expect(verifyVapiSecret({ 'x-vapi-secret': 'topsecret' })).toBe(true);
  });
});
