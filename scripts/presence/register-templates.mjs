#!/usr/bin/env node
/**
 * Presence: register the two WhatsApp utility templates on the WABA.
 * ==================================================================
 * The family reads the digest after each call and an urgent line when a call
 * needs someone now. A template is the only message that lands OUTSIDE Meta's
 * 24-hour service window, so without these the relay only reaches a family
 * member who wrote to the number that day (presenceRelay falls back to plain
 * text in that case).
 *
 * Usage:
 *   KAPSO_BUSINESS_ACCOUNT_ID=<waba-id> node scripts/presence/register-templates.mjs
 *   node scripts/presence/register-templates.mjs <waba-id>
 *
 * Mirrors scripts/register-statement-nag-template.mjs (Kapso proxy, not
 * graph.facebook.com). Meta reviews templates in minutes to hours. Parameter
 * values must be one line; presenceRelay strips newlines and caps them.
 */

import dotenv from 'dotenv';
import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';

dotenv.config({ path: new URL('../../.env.production', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });
dotenv.config();

const TEMPLATES = [
  {
    name: 'presence_call_digest',
    language: 'pt_BR',
    category: 'UTILITY',
    allowCategoryChange: false,
    components: [
      {
        type: 'BODY',
        // {{1}} her name, {{2}} what she shared (one line), {{3}} what needs a person or "nada desta vez".
        text: 'A Presença conversou com {{1}} hoje. Ela contou que: {{2}}. Precisa de você: {{3}}. Responda esta mensagem e ela ouve na próxima ligação.',
        example: { body_text: [['Lurdes', 'estava animada, contou da feira e do bolo que fez', 'nada desta vez']] },
      },
    ],
  },
  {
    name: 'presence_urgent',
    language: 'pt_BR',
    category: 'UTILITY',
    allowCategoryChange: false,
    components: [
      {
        type: 'BODY',
        // {{1}} her name, {{2}} the items that need a person now.
        text: 'Urgente: na ligação de hoje, {{1}} falou de algo que precisa de uma pessoa agora: {{2}}. A Presença não é um serviço de emergência.',
        example: { body_text: [['Lurdes', 'ela caiu no banheiro de manhã e sente dor no quadril']] },
      },
    ],
  },
];

const businessAccountId = process.env.KAPSO_BUSINESS_ACCOUNT_ID || process.argv[2];
if (!businessAccountId) {
  console.error('Missing WABA id: set KAPSO_BUSINESS_ACCOUNT_ID or pass it as the first argument.');
  process.exit(1);
}
if (!process.env.KAPSO_API_KEY) {
  console.error('KAPSO_API_KEY not set.');
  process.exit(1);
}

const client = new WhatsAppClient({
  kapsoApiKey: process.env.KAPSO_API_KEY.trim(),
  baseUrl: 'https://api.kapso.ai/meta/whatsapp',
  graphVersion: 'v24.0',
});

for (const template of TEMPLATES) {
  try {
    const existing = await client.templates.list({ businessAccountId, name: template.name });
    const found = (existing?.data || existing?.templates || []).find?.((t) => t.name === template.name);
    if (found) {
      console.log(`${template.name}: already exists (status ${found.status || 'unknown'}).`);
      continue;
    }
  } catch (err) {
    console.warn(`${template.name}: could not list templates (continuing to create): ${err.message}`);
  }
  try {
    const res = await client.templates.create({ businessAccountId, ...template });
    console.log(`${template.name}: submitted for Meta review (${res?.status || 'pending'}).`);
  } catch (err) {
    console.error(`${template.name}: creation failed: ${err.message}`);
    if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
    process.exitCode = 1;
  }
}
