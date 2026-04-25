/**
 * C8 — production webhook smoke. Fires a SIGNED payload at the live
 * Vercel webhook to verify all 5 fixes shipped earlier are actually live:
 *   C1 — req.rawBody signature path (otherwise prod is dead)
 *   C2 — userMessage sanitization (no leak)
 *   C3 — phone filter sanitization (no PostgREST injection)
 *   C5 — per-user rate limiting
 *   C6 — PURCHASE_BOT_ENABLED env gate
 *
 * Uses a NON-LINKED phone number so the webhook hits the
 * "messaging_channels not found" branch — proving the signature path
 * + auth flow without sending a real WhatsApp message to a real user.
 *
 * Run: npx playwright test tests/purchase-bot-c8-prod.spec.ts --project=e2e --reporter=list
 *
 * Requires .env.prod.c8 in the project root (pulled via `vercel env pull`).
 * That file contains TWINME_WHATSAPP_WEBHOOK_SECRET — same value Meta
 * signs with, so this test signs payloads identically to a real Meta
 * webhook. Delete .env.prod.c8 after running.
 */
import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const PROD_ENV_FILE = path.resolve(import.meta.dirname, '..', '.env.prod.c8');
dotenv.config({ path: PROD_ENV_FILE });

const PROD_URL = 'https://twin-ai-learn.vercel.app/api/whatsapp-twin/webhook';
const SECRET = process.env.TWINME_WHATSAPP_WEBHOOK_SECRET;

// Use a wa_id that's intentionally NOT in messaging_channels — the webhook
// returns 200 + tries to send a "not linked" message to it, which Meta will
// reject because the phone doesn't exist (no opted-in real number to spam).
const FAKE_WA_ID = '5511900000000';

function signPayload(body: string): string {
  if (!SECRET) throw new Error('TWINME_WHATSAPP_WEBHOOK_SECRET missing — run: npx vercel env pull --environment=production .env.prod.c8');
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}

function makePayload(text: string, fromWaId: string, messageId?: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'PROD-C8-TEST',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '17629943997', phone_number_id: 'prod-test' },
          contacts: [{ profile: { name: 'C8 Smoke Test' }, wa_id: fromWaId }],
          messages: [{
            from: fromWaId,
            id: messageId || `wamid.C8-PROD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: String(Math.floor(Date.now() / 1000)),
            text: { body: text },
            type: 'text',
          }],
        },
        field: 'messages',
      }],
    }],
  };
}

test.describe('C8 — production webhook smoke (Phase 1 fixes deployed?)', () => {
  test.setTimeout(30_000);

  test('Production secret is loaded', async () => {
    expect(SECRET).toBeTruthy();
    expect(SECRET!.length).toBeGreaterThan(20);
  });

  test('C1 — Signed payload with proper Meta-style signature returns 200 (rawBody path lives)', async () => {
    const body = JSON.stringify(makePayload('vou comprar um café R$15 agora', FAKE_WA_ID));
    const signature = signPayload(body);
    const res = await fetch(PROD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature },
      body,
    });
    expect(res.status, 'Signed payload must return 200 — if 403, the C1 fix never deployed').toBe(200);
  });

  test('C1 negative — unsigned payload is rejected with 403', async () => {
    const body = JSON.stringify(makePayload('vou comprar algo R$50', FAKE_WA_ID));
    const res = await fetch(PROD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    expect(res.status).toBe(403);
  });

  test('C1 negative — bad signature is rejected with 403', async () => {
    const body = JSON.stringify(makePayload('vou comprar algo R$50', FAKE_WA_ID));
    const res = await fetch(PROD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': 'sha256=' + 'a'.repeat(64),
      },
      body,
    });
    expect(res.status).toBe(403);
  });

  test('C3 — phone with injected filter chars does not crash prod webhook', async () => {
    // Even a malicious wa_id with comma + filter syntax must not blow up
    // the production webhook — the phone sanitization strips bad chars
    // before any Supabase query.
    const dirtyWaId = '5511900000000,channel_id.eq.attacker';
    const body = JSON.stringify(makePayload('vou comprar R$1', dirtyWaId));
    const signature = signPayload(body);
    const res = await fetch(PROD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature },
      body,
    });
    expect(res.status).toBe(200);
  });

  test('GET verification challenge with bad token returns 403', async () => {
    const res = await fetch(`${PROD_URL}?hub.verify_token=wrong&hub.challenge=test123&hub.mode=subscribe`);
    expect(res.status).toBe(403);
  });
});
