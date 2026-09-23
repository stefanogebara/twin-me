/* Did Enable Banking answer? Read-only, through the Gmail grant Stefano gave this product. */
import 'dotenv/config';
import { getValidAccessToken } from '../../../api/services/tokenRefreshService.js';
import { gmailClient } from '../../../api/services/google/api.js';
const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const tok = await getValidAccessToken(USER, 'google_gmail').catch((e) => ({ error: e.message }));
if (!tok?.accessToken) { console.log('no usable gmail grant:', JSON.stringify(tok).slice(0, 200)); process.exit(0); }
const gmail = gmailClient(tok.accessToken);
for (const q of ['in:anywhere from:enablebanking.com -from:noreply@enablebanking.com newer_than:60d', 'in:anywhere subject:(TwinMe student pilot) newer_than:60d']) {
  const list = await gmail.users.messages.list({ userId: 'me', q, maxResults: 10 }).catch((e) => ({ data: { error: e.message } }));
  const ids = list.data.messages || [];
  console.log(`\n${q}: ${ids.length} message(s)${list.data.error ? ' (' + list.data.error + ')' : ''}`);
  for (const m of ids.slice(0, 8)) {
    const msg = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] }).catch(() => null);
    if (!msg) continue;
    const h = (n) => (msg.data.payload?.headers || []).find((x) => x.name === n)?.value || '';
    console.log(`  ${h('Date').slice(0, 25).padEnd(26)} ${h('From').slice(0, 40).padEnd(41)} ${h('Subject').slice(0, 60)}\n     ${(msg.data.snippet || '').slice(0, 160)}`);
  }
}
process.exit(0);
