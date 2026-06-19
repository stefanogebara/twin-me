/**
 * Register the `statement_nag` WhatsApp utility template on the WABA.
 * ====================================================================
 * One-time setup for the monthly statement-nag cron: template sends are the
 * only messages that deliver OUTSIDE Meta's 24h customer-service window, so
 * without this the nag only reaches users who messaged their twin that day.
 *
 * Usage:
 *   KAPSO_BUSINESS_ACCOUNT_ID=<waba-id> node scripts/register-statement-nag-template.mjs
 *   node scripts/register-statement-nag-template.mjs <waba-id>
 *
 * The WABA id is in the Kapso dashboard (WhatsApp -> Business Account) or in
 * Meta Business Manager. After registration Meta reviews the template
 * (minutes to hours); the cron falls back to plain text until it's APPROVED.
 *
 * Wording rules (WhatsApp Business Messaging Policy): asks for "your
 * statement" only — never solicits account numbers or identifiers.
 * allowCategoryChange lets Meta reclassify UTILITY -> MARKETING instead of
 * rejecting outright (marketing delivery still works, just costs ~3x).
 */

import dotenv from 'dotenv';
import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';

dotenv.config({ path: new URL('../.env.production', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });
dotenv.config(); // .env fallback for local runs

const TEMPLATE = {
  name: 'statement_nag',
  language: 'en',
  category: 'UTILITY',
  // Enforce UTILITY: a marketing reclassification costs ~3x and is subject to
  // marketing opt-out, so we'd rather Meta reject a borderline submission than
  // silently bill it as MARKETING. (The first approval landed as MARKETING with
  // allowCategoryChange:true and promotional wording — see body below.)
  allowCategoryChange: false,
  components: [
    {
      type: 'BODY',
      // UTILITY-qualifying wording: ties to a specific, expected account update
      // (the statement period closing) and asks only for the statement file. No
      // promotional tone, no value-prop framing — that phrasing is what gets a
      // statement reminder classified MARKETING.
      text:
        'Your bank statement for last month is now available to import. ' +
        'To keep your transaction records up to date, reply here with the ' +
        'statement file (OFX or CSV) exported from your bank app.',
    },
  ],
};

const businessAccountId = process.env.KAPSO_BUSINESS_ACCOUNT_ID || process.argv[2];
if (!businessAccountId) {
  console.error(
    'Missing WABA id.\n' +
    'Find it in the Kapso dashboard (WhatsApp -> Business Account) or Meta Business Manager, then run:\n' +
    '  node scripts/register-statement-nag-template.mjs <waba-id>\n' +
    'or set KAPSO_BUSINESS_ACCOUNT_ID in the environment.',
  );
  process.exit(1);
}
if (!process.env.KAPSO_API_KEY) {
  console.error('KAPSO_API_KEY not set (check .env.production).');
  process.exit(1);
}

// Route template calls through the Kapso proxy, NOT Meta's graph.facebook.com.
// Without baseUrl the SDK targets graph.facebook.com and sends the Kapso key as
// a Meta access token, which Meta rejects with "(#200) Provide valid app ID" /
// "Object ... does not exist ... missing permissions" — the same SDK bug that
// silently broke every outbound send until whatsappService.js was switched to
// the proxy on 2026-06-16. The SDK builds `${baseUrl}/${graphVersion}/<path>`
// and attaches the X-API-Key header automatically.
const client = new WhatsAppClient({
  kapsoApiKey: process.env.KAPSO_API_KEY?.trim(),
  baseUrl: 'https://api.kapso.ai/meta/whatsapp',
  graphVersion: 'v24.0',
});

// Idempotent: skip creation if the template already exists.
try {
  const existing = await client.templates.list({ businessAccountId, name: TEMPLATE.name });
  const found = (existing?.data || existing?.templates || []).find?.((t) => t.name === TEMPLATE.name);
  if (found) {
    console.log(`Template '${TEMPLATE.name}' already exists (status: ${found.status || 'unknown'}). Nothing to do.`);
    process.exit(0);
  }
} catch (err) {
  console.warn(`Could not list templates (continuing to create): ${err.message}`);
}

try {
  const res = await client.templates.create({ businessAccountId, ...TEMPLATE });
  console.log('Template submitted for Meta review:');
  console.log(JSON.stringify(res, null, 2));
  console.log(
    '\nNext: Meta reviews it (minutes to hours). Once APPROVED, the monthly ' +
    'statement-nag cron delivers outside the 24h window automatically — no ' +
    'code change needed (cron-statement-nag.js already tries the template first).',
  );
} catch (err) {
  console.error(`Template creation failed: ${err.message}`);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
}
