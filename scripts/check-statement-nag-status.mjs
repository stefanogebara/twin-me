/**
 * Read-only status check for the `statement_nag` WhatsApp template.
 * =================================================================
 * Single GET against the Kapso proxy (api.kapso.ai → Meta Graph) for the
 * template's review status. No writes, no settings changes — safe for the
 * autonomous whatsapp-send-recovery-watch scheduled task to run each cycle.
 *
 * Prints one line: STATUS=<APPROVED|PENDING|REJECTED|NOT_FOUND|ERROR> ...
 *
 * Usage:
 *   node scripts/check-statement-nag-status.mjs
 *   node scripts/check-statement-nag-status.mjs <waba-id>   # override
 *
 * Why the proxy (not graph.facebook.com): the Kapso API key is NOT a Meta
 * access token. Sending it to Meta directly returns "(#200) Provide valid app
 * ID". The proxy translates the X-API-Key header — same fix as the send path
 * (whatsappService.js, 2026-06-16) and the register script.
 */
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: new URL('../.env.production', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });
dotenv.config();

const apiKey = process.env.KAPSO_API_KEY?.trim();
// WABA id read from the Kapso dashboard (Phone numbers → Advanced settings).
const waba = (process.argv[2] || process.env.KAPSO_BUSINESS_ACCOUNT_ID || '1247524677467078').trim();
const TEMPLATE = 'statement_nag';

if (!apiKey) {
  console.log('STATUS=ERROR reason=KAPSO_API_KEY not set (check .env.production)');
  process.exit(1);
}

try {
  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${waba}/message_templates`;
  const { data } = await axios.get(url, {
    params: { name: TEMPLATE },
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    timeout: 15000,
  });
  const rows = data?.data || data?.templates || [];
  const tpl = Array.isArray(rows) ? rows.find((t) => t?.name === TEMPLATE) : null;
  if (!tpl) {
    console.log(`STATUS=NOT_FOUND template=${TEMPLATE} waba=${waba}`);
  } else {
    console.log(`STATUS=${tpl.status || 'UNKNOWN'} template=${TEMPLATE} id=${tpl.id || 'n/a'} category=${tpl.category || 'n/a'}`);
  }
} catch (err) {
  const detail = err.response?.data?.error?.message || err.response?.data?.error || err.message;
  console.log(`STATUS=ERROR http=${err.response?.status || 'n/a'} reason=${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  process.exit(1);
}
