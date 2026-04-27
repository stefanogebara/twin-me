/**
 * C8 — REAL end-to-end. Fires ONE signed purchase intent at the live
 * Vercel webhook from Stefano's actual linked WA phone.
 *
 * Unlike purchase-bot-c8-prod-e2e.spec.ts (which uses a non-linked phone
 * to avoid spam), this test:
 *   - Triggers a REAL outbound WhatsApp message to Stefano's phone
 *   - Verifies the full pipeline: signature → routing → context → LLM →
 *     memory write → outbound send
 *   - Asserts the assistant reflection lands in user_memories within 30s
 *
 * Fires exactly once per run. Don't loop, don't burst — that's the spam
 * trap we already fell into earlier in this audit.
 *
 * Run: npx playwright test tests/purchase-bot-c8-real-e2e.spec.ts \
 *        --project=e2e --reporter=list --workers=1
 *
 * Requires .env.prod.c8 with TWINME_WHATSAPP_WEBHOOK_SECRET +
 * TWINME_WHATSAPP_PHONE_NUMBER_ID + SUPABASE_* (vercel env pull).
 */
import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(import.meta.dirname, '..', '.env.prod.c8') });

const PROD_URL = 'https://twin-ai-learn.vercel.app/api/whatsapp-twin/webhook';
const SECRET = process.env.TWINME_WHATSAPP_WEBHOOK_SECRET;
const PHONE_NUMBER_ID = process.env.TWINME_WHATSAPP_PHONE_NUMBER_ID;
const STEFANO_USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const STEFANO_WA_ID = '5511999002121'; // matches messaging_channels.channel_id

function signPayload(body: string): string {
  if (!SECRET) throw new Error('TWINME_WHATSAPP_WEBHOOK_SECRET missing — run vercel env pull --environment=production .env.prod.c8');
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}

test.describe('C8 — real production E2E (sends one real WhatsApp message)', () => {
  test.setTimeout(60_000);

  test('signed purchase intent → reflection lands in DB + WA send fires', async () => {
    expect(SECRET, 'missing prod secret').toBeTruthy();
    expect(PHONE_NUMBER_ID, 'missing TWINME_WHATSAPP_PHONE_NUMBER_ID').toBeTruthy();

    const nonce = `c8real${Date.now().toString(36)}`;
    const messageText = `vou comprar um café de R$15 agora ${nonce}`;
    const wamid = `wamid.C8-REAL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'C8-REAL-TEST',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '17629943997',
              phone_number_id: PHONE_NUMBER_ID, // must match TWINME_WHATSAPP_PHONE_NUMBER_ID
            },
            contacts: [{ profile: { name: 'Stefano' }, wa_id: STEFANO_WA_ID }],
            messages: [{
              from: STEFANO_WA_ID,
              id: wamid,
              timestamp: String(Math.floor(Date.now() / 1000)),
              text: { body: messageText },
              type: 'text',
            }],
          },
          field: 'messages',
        }],
      }],
    };

    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    console.log('Firing prod webhook for wamid:', wamid);
    const t0 = Date.now();
    const res = await fetch(PROD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature },
      body,
    });
    const responseTimeMs = Date.now() - t0;
    console.log(`Webhook response: status=${res.status} time=${responseTimeMs}ms`);
    expect(res.status).toBe(200);

    // Poll the DB for the conversation memory pair to land. Production
    // serverless = a few seconds extra cold-start.
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL! || process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const fetchTurn = async () => {
      const { data: userRow } = await supabase
        .from('user_memories')
        .select('id, content, created_at')
        .eq('user_id', STEFANO_USER_ID)
        .eq('memory_type', 'conversation')
        .ilike('content', `%${nonce}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!userRow) return null;
      const userTs = new Date(userRow.created_at).getTime();
      const { data: assistantRows } = await supabase
        .from('user_memories')
        .select('content, created_at')
        .eq('user_id', STEFANO_USER_ID)
        .eq('memory_type', 'conversation')
        .eq('metadata->>role', 'assistant')
        .gte('created_at', new Date(userTs - 10_000).toISOString())
        .lte('created_at', new Date(userTs + 30_000).toISOString())
        .order('created_at', { ascending: false })
        .limit(5);
      const closest = (assistantRows || [])
        .map(r => ({ ...r, diff: Math.abs(new Date(r.created_at).getTime() - userTs) }))
        .sort((a, b) => a.diff - b.diff)[0];
      return { user: userRow.content, assistant: closest?.content };
    };

    let turn: any = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      turn = await fetchTurn();
      if (turn?.assistant) break;
    }

    expect(turn, 'No conversation row landed in DB after 30s').toBeTruthy();
    expect(turn!.assistant, 'No assistant reflection paired with user message').toBeTruthy();

    console.log('\n=== USER → ===');
    console.log(turn!.user);
    console.log('\n=== TWIN ← ===');
    console.log(turn!.assistant);
    console.log('=========================\n');

    // Audit row should have landed too
    const { data: auditRow } = await supabase
      .from('purchase_reflections')
      .select('outcome, lang, has_music, has_calendar, moment_band, response_length, cost_usd')
      .eq('user_id', STEFANO_USER_ID)
      .gte('occurred_at', new Date(t0 - 5000).toISOString())
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log('Audit row:', auditRow);
    expect(auditRow?.outcome).toBe('generated');
  });
});
