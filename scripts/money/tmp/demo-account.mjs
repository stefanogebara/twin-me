/* A demo person, and a signed-in browser session for them. Clearly named so it can be found
   and removed: nothing here should ever be mistaken for a real pilot user. */
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const BASE = process.argv[2] || 'https://www.twinme.me';
const EMAIL = process.argv[3] || 'demo.sheet@twinme.me';
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const raw = crypto.randomBytes(32).toString('hex');
await sb.from('magic_link_tokens').insert({
  token_hash: crypto.createHash('sha256').update(raw).digest('hex'),
  email: EMAIL, expires_at: new Date(Date.now() + 1800000).toISOString(),
});
console.log(`link: ${BASE}/api/auth/magic-link/verify?token=${raw}`);

/* verify redirects to /oauth/callback with a one-time auth code; the session cookie is set
   when that code is claimed, which is what the page does in a browser. */
const r = await fetch(`${BASE}/api/auth/magic-link/verify?token=${raw}`, { redirect: 'manual' });
const code = (String(r.headers.get('location') || '').match(/auth_code=([a-f0-9]+)/) || [])[1];
if (!code) { console.error('no auth code:', r.status, r.headers.get('location')); process.exit(1); }
const claim = await fetch(`${BASE}/api/auth/oauth/claim?auth_code=${code}`, { redirect: 'manual' });
const all = typeof claim.headers.getSetCookie === 'function' ? claim.headers.getSetCookie() : [claim.headers.get('set-cookie') || ''];
const cookie = all.map((c) => c.split(';')[0]).find((c) => c.startsWith('refresh_token=') && c.length > 'refresh_token='.length);
if (!cookie) { console.error('no session cookie after claim:', claim.status, (await claim.text()).slice(0, 160)); process.exit(1); }

const rf = await fetch(`${BASE}/api/auth/refresh`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' } });
const { accessToken, user } = await rf.json();
const { data: row } = await sb.from('users').select('id, email, created_at').eq('email', EMAIL).single();
console.log(`user: ${row?.id} ${row?.email} created ${String(row?.created_at).slice(0, 19)}`);
console.log(`token: ${accessToken?.slice(0, 24)}...`);
console.log(JSON.stringify({ userId: row?.id, accessToken, email: EMAIL }));
process.exit(0);
