/* The one dated follow-up to Enable Banking (D19, question 5), as a reply on Stefano's own thread. */
import 'dotenv/config';
import { getValidAccessToken } from '../../../api/services/tokenRefreshService.js';
import { gmailClient } from '../../../api/services/google/api.js';
const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const DRY = !process.argv.includes('--send');
const tok = await getValidAccessToken(USER, 'google_gmail');
const gmail = gmailClient(tok.accessToken);
const list = await gmail.users.messages.list({ userId: 'me', q: 'subject:(TwinMe student pilot) to:enablebanking.com', maxResults: 1 });
const id = list.data.messages?.[0]?.id;
if (!id) { console.log('original message not found'); process.exit(1); }
const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['Message-ID', 'To', 'Subject', 'From'] });
const h = (n) => (msg.data.payload?.headers || []).find((x) => x.name.toLowerCase() === n.toLowerCase())?.value || '';
const to = h('To'), subject = h('Subject'), mid = h('Message-ID'), from = h('From'), threadId = msg.data.threadId;
console.log(`replying on thread ${threadId}\n  to: ${to}\n  subject: Re: ${subject}`);
const body = [
  'Hello again,',
  '',
  'Following up on my note of 18 September about the TwinMe student pilot: ten invited users, PSD2 through your API, one live Santander consent already running in production.',
  '',
  'Could you tell me whether the pilot is eligible under your current terms, and what the pricing would be for ten connected users? If someone else on your side handles this, I would be grateful for a pointer.',
  '',
  'Thank you,',
  'Stefano Gebara',
].join('\r\n');
const raw = [
  `From: ${from}`, `To: ${to}`, `Subject: Re: ${subject}`,
  `In-Reply-To: ${mid}`, `References: ${mid}`,
  'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', '', body,
].join('\r\n');
if (DRY) { console.log('\n--- dry run; the message that would be sent ---\n' + body); process.exit(0); }
const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
  method: 'POST', headers: { Authorization: `Bearer ${tok.accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ raw: Buffer.from(raw).toString('base64url'), threadId }),
});
const out = await res.json();
console.log(res.ok ? `sent: message ${out.id} on thread ${out.threadId}` : `NOT sent (${res.status}): ${out.error?.message || JSON.stringify(out).slice(0, 200)}`);
process.exit(res.ok ? 0 : 1);
