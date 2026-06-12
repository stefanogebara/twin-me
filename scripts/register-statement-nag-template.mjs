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
  allowCategoryChange: true,
  components: [
    {
      type: 'BODY',
      text:
        'New month! Your bank statement from last month just closed. ' +
        'Export it from your bank app (OFX or CSV) and send the file here — ' +
        'I\'ll read it and keep your money picture sharp.',
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

const client = new WhatsAppClient({ kapsoApiKey: process.env.KAPSO_API_KEY });

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
