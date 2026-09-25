/* Three refreshes at once must all be answered. Before 2026-09-25 two of them were 401s and
   the tabs that got them fell to sign-in. */
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const BASE = process.argv[2] || 'https://www.twinme.me';
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const raw = crypto.randomBytes(32).toString('hex');
await sb.from('magic_link_tokens').insert({ token_hash: crypto.createHash('sha256').update(raw).digest('hex'), email: 'stefanogebara@gmail.com', expires_at: new Date(Date.now() + 600000).toISOString() });
const r = await fetch(`${BASE}/api/auth/magic-link/verify?token=${raw}`, { redirect: 'manual' });
/* setRefreshCookie emits two Set-Cookie headers: one expiring any legacy host-only cookie,
   then the real one. headers.get() returns only the first, which is the empty one. */
const all = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || ''];
const cookie = all.map((c) => c.split(';')[0]).find((c) => c.startsWith('refresh_token=') && c.length > 'refresh_token='.length);
if (!cookie) { console.log('no usable cookie among', all.length, 'headers'); process.exit(1); }
const hit = () => fetch(`${BASE}/api/auth/refresh`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' } })
  .then(async (x) => ({ status: x.status, rotated: Boolean(x.headers.get('set-cookie')), token: Boolean((await x.json()).accessToken) }));
const three = await Promise.all([hit(), hit(), hit()]);
for (const [i, t] of three.entries()) console.log(`call ${i + 1}: ${t.status}  new cookie ${t.rotated}  access token ${t.token}`);
console.log(three.every((t) => t.status === 200 && t.token) ? '\nPASS all three answered with a token' : '\nFAIL someone was signed out');
process.exit(0);
