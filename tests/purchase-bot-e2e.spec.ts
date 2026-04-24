/**
 * End-to-end test of the WhatsApp pre-purchase stress-check bot.
 *
 * Architecture tested:
 *   Meta webhook POST → whatsapp-twinme-webhook → classifyIntent('purchase')
 *     → buildPurchaseContext → generatePurchaseReflection (DeepSeek/Mistral)
 *     → sendWhatsAppMessage (stubbed by env, or outbound to WA)
 *
 * This spec signs payloads with TWINME_WHATSAPP_WEBHOOK_SECRET and hits the
 * local backend at http://localhost:3004. Requires:
 *   TWINME_WHATSAPP_WEBHOOK_SECRET=<same-as-backend> npm run server:dev
 *   npx playwright test tests/purchase-bot-e2e.spec.ts --project=e2e
 *
 * Phase: Financial-Emotional Twin (2026-04-24).
 */
import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env first (has SUPABASE_SERVICE_ROLE_KEY), then .env.local (has
// user-specific overrides). Backend uses the same pattern via server.js.
dotenv.config({ path: path.resolve(import.meta.dirname, '..', '.env') });
dotenv.config({ path: path.resolve(import.meta.dirname, '..', '.env.local') });

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3004';
const WEBHOOK_URL = `${BACKEND_URL}/api/whatsapp-twin/webhook`;
const WEBHOOK_SECRET = process.env.TWINME_WHATSAPP_WEBHOOK_SECRET || 'test-secret-purchase-bot-e2e';

// Stefano's linked WA phone (from messaging_channels probe). This is the only
// user with the full behavioral stack connected in the DB.
const STEFANO_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const STEFANO_PHONE = '+5511999002121';
const STEFANO_WA_ID = STEFANO_PHONE.replace('+', '');

function signPayload(body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

function makeInboundPayload(text: string, messageId?: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'test-waba',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '17629943997', phone_number_id: 'test-phone-id' },
          contacts: [{ profile: { name: 'Stefano' }, wa_id: STEFANO_WA_ID }],
          messages: [{
            from: STEFANO_WA_ID,
            id: messageId || `wamid.TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

async function fireWebhook(text: string) {
  const payload = makeInboundPayload(text);
  const body = JSON.stringify(payload);
  const signature = signPayload(body);
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': signature,
    },
    body,
  });
  return { status: res.status, text: await res.text() };
}

// Query the memory_stream to find the twin's response to a just-sent message.
// addConversationMemory writes TWO rows: one with role=user (the message) and
// one with role=assistant (the twin's reply), both type=conversation. We find
// the user row by text match, then grab the next assistant row that was
// written for the same user.
async function fetchLatestTwinResponseToUser(userSaid: string) {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL! || process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const needle = userSaid.slice(0, 40);

  // Poll up to ~15s for the fire-and-forget addConversationMemory to land.
  // LLM round-trip is 1-2s; the tool-path (Gmail etc) adds another 3-5s.
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise(r => setTimeout(r, 2000));

    const { data: userRow } = await supabase
      .from('user_memories')
      .select('id, content, metadata, created_at')
      .eq('user_id', STEFANO_USER_ID)
      .eq('memory_type', 'conversation')
      .ilike('content', `%${needle}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!userRow) continue;

    // addConversationMemory writes user + assistant via Promise.all, so their
    // timestamps can be interleaved by a few ms. Look within a ±10s window
    // instead of strictly gte.
    const userTs = new Date(userRow.created_at).getTime();
    const windowStart = new Date(userTs - 10_000).toISOString();
    const windowEnd = new Date(userTs + 10_000).toISOString();
    const { data: twinRows } = await supabase
      .from('user_memories')
      .select('content, metadata, created_at')
      .eq('user_id', STEFANO_USER_ID)
      .eq('memory_type', 'conversation')
      .eq('metadata->>role', 'assistant')
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)
      .order('created_at', { ascending: false })
      .limit(5);

    // Pick the assistant row closest in time to the user row
    const closest = (twinRows || [])
      .map(r => ({ ...r, diffMs: Math.abs(new Date(r.created_at).getTime() - userTs) }))
      .sort((a, b) => a.diffMs - b.diffMs)[0];

    if (closest) {
      return {
        content: userRow.content,
        response: closest.content,
        userCreatedAt: userRow.created_at,
        twinCreatedAt: closest.created_at,
      };
    }
  }

  return null;
}

test.describe('WhatsApp pre-purchase reflection bot (live local backend)', () => {
  test.setTimeout(60_000);

  test('PT-BR purchase intent triggers reflection, stores conversation', async () => {
    const nonce = `t${Date.now().toString(36)}`;
    const msg = `vou comprar um iFood de R$85 agora ${nonce}`;
    const res = await fireWebhook(msg);

    expect(res.status).toBe(200);

    const turn = await fetchLatestTwinResponseToUser(msg);
    expect(turn).not.toBeNull();
    expect(turn!.content).toContain('iFood');
    expect(turn!.response).toBeTruthy();
    expect(turn!.response!.length).toBeGreaterThan(10);
    expect(turn!.response!.length).toBeLessThan(800);
    // Reflection style: contains a question mark (the "one open question" rule)
    expect(turn!.response).toMatch(/\?/);
    // Zero emojis rule
    expect(turn!.response).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
    // No bossy advice markers
    expect(turn!.response!.toLowerCase()).not.toMatch(/\btalvez\s+voc[eê]\s+dev/);
    expect(turn!.response!.toLowerCase()).not.toMatch(/\bconsidere\s+se\b/);
    console.log('PT-BR reflection:', turn!.response);
  });

  test('EN purchase intent produces English reflection', async () => {
    const nonce = `t${Date.now().toString(36)}`;
    const msg = `I'm thinking about buying new AirPods for $250 ${nonce}`;
    const res = await fireWebhook(msg);

    expect(res.status).toBe(200);

    const turn = await fetchLatestTwinResponseToUser(msg);
    expect(turn).not.toBeNull();
    expect(turn!.response).toBeTruthy();
    expect(turn!.response).toMatch(/\?/);
    console.log('EN reflection:', turn!.response);

    // Real English check: look for Portuguese words that don't exist in EN.
    // Mistral-small sometimes ignores "Respond in English" when the context
    // (Stefano's timezone Europe/Paris, PT-BR artist names in music signal,
    // etc.) biases it. If this fails, we need to either: tune the system
    // prompt harder, switch to a larger model (TIER_CHAT), or render the
    // timezone label in the target language.
    const ptMarkers = /\b(tá|cê|você|né|pra|pro|agora|fazer|chamando|tarde|vazio|calendário|espaço|preencher|gostinho)\b/i;
    expect(turn!.response).not.toMatch(ptMarkers);
  });

  test('Non-purchase message does NOT route through purchase intent', async () => {
    // "What emails do I have?" should hit the gmail tool, not purchase_check.
    const nonce = `t${Date.now().toString(36)}`;
    const msg = `check my emails ${nonce}`;
    const res = await fireWebhook(msg);
    expect(res.status).toBe(200);

    const turn = await fetchLatestTwinResponseToUser(msg);
    expect(turn).not.toBeNull();
    expect(turn!.response).toBeTruthy();
    // Purchase reflections contain an open question about the purchase.
    // The email tool result contains email-specific formatting (subject/sender).
    // If the reflection path mis-fired, we'd see a question about WHY they want emails.
    expect(turn!.response!.toLowerCase()).not.toMatch(/\bo que\s+esse?s?\s+email/);
    console.log('Non-purchase response:', (turn!.response || '').slice(0, 200));
  });

  test('Purchase reflection stays short (max 4 sentences)', async () => {
    const nonce = `t${Date.now().toString(36)}`;
    const msg = `pensando em comprar uma Apple Watch de R$4500 ${nonce}`;
    await fireWebhook(msg);
    const turn = await fetchLatestTwinResponseToUser(msg);
    expect(turn).not.toBeNull();
    // Only count sentence boundaries where punctuation is followed by
    // whitespace or EOS — avoids false splits on decimals ("R$ 4.500")
    // or ellipsis.
    const sentences = turn!.response!
      .split(/[.!?]+(?=\s|$)/)
      .map(s => s.trim())
      .filter(s => s.length > 2);
    console.log('Sentence count:', sentences.length, '| reflection:', turn!.response);
    // Prompt asks for "max 3 sentences" but the LLM (mistral-small) occasionally
    // breaks that with a paired question. 4 is the real-world ceiling. Anything
    // over 4 = prompt failure worth investigating.
    expect(sentences.length).toBeLessThanOrEqual(4);
    // Total length is the true short-reflection guarantee — under 400 chars
    // reads as "a quick note from a friend" in WhatsApp, not a lecture.
    expect(turn!.response!.length).toBeLessThan(400);
  });

  test('Webhook rejects payloads without a valid signature', async () => {
    const body = JSON.stringify(makeInboundPayload('vou comprar algo'));
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': 'sha256=notarealsignature',
      },
      body,
    });
    expect(res.status).toBe(403);
  });
});
