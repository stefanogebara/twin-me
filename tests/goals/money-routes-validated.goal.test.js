/**
 * Goal: every write route on every staying router runs validate() before its handler (M1-2,
 * 2026-09-19 for money and sign-in; M1-B, 2026-09-22 for everything the unmount left mounted),
 * except the routes named as exempt with the reason.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/* Every staying route file with a write (M1-B, 2026-09-22; the set is what
   scripts/ci/staying-roots.txt reaches). An exemption is a route that reads no body and no
   parameter, one that parses a raw or multipart body its own way, or a webhook whose body is
   the provider's contract and whose door is a signature. */
const FILES = {
  'money.js': new Set(['/inbox/resend', '/chat/attach', '/bank/refresh-if-stale', '/calendar/learn', '/statement']),
  'capture-key-legacy.js': new Set(),
  'auth-simple.js': new Set(['/desktop-handoff']),
  'extension-data.js': new Set(),
  'purchase-notification.js': new Set(),
  'whatsapp-link.js': new Set(['/unlink']),
  'oauth-callback.js': new Set(),
  'calendar-oauth.js': new Set(['/disconnect']),
  'account.js': new Set(['/']),
  'consent.js': new Set(),
  'feature-flags.js': new Set(),
  'presence.js': new Set(),
  'presence-call.js': new Set(),
  'billing.js': new Set(['/webhook', '/portal']),
  'beta.js': new Set(),
  'beta-public.js': new Set(),
  'beta-feedback.js': new Set(),
  'beta-admin.js': new Set(),
  /* Webhooks: a signature or a shared secret at the door, the provider's shape inside. */
  'webhooks.js': new Set(['/github/:userId', '/gmail', '/discord/:userId']),
  'webhooks-elevenlabs.js': new Set(['/post-call', '/initiation']),
  'whatsapp-kapso-webhook.js': new Set(['/webhook']),
  /* A text/plain export, parsed by the handler. A reset with no body. */
  'whatsapp-import.js': new Set(['/import']),
  'system-health.js': new Set(['/circuit-breaker/reset']),
};
const read = (f) => readFileSync(new URL(`../../api/_app/routes/${f}`, import.meta.url), 'utf8');

describe('the write routes are validated', () => {
  for (const [file, exempt] of Object.entries(FILES)) {
    it(`${file}: validate() runs on every post, delete and patch that reads a body or a parameter`, () => {
      const src = read(file);
      const routes = [...src.matchAll(/^router\.(post|delete|patch|put)\('([^']+)'([^\n]*)/gm)].map((m) => ({ path: m[2], rest: m[3] }));
      expect(routes.length).toBeGreaterThan(0);
      const bare = routes.filter((r) => !exempt.has(r.path) && !/validate\(\{/.test(r.rest)).map((r) => r.path);
      expect(bare).toEqual([]);
    });
  }
});
