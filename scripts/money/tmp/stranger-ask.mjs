import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import dotenv from 'dotenv'; dotenv.config({ path: '.env', quiet: true });
const API = 'https://twin-ai-learn.vercel.app';
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const raw = crypto.randomBytes(32).toString('hex');
await sb.from('magic_link_tokens').insert({ token_hash: crypto.createHash('sha256').update(raw).digest('hex'), email: 'stefanogebara+stranger0913@gmail.com', expires_at: new Date(Date.now() + 600000).toISOString() });
const r = await fetch(`${API}/api/auth/magic-link/verify?token=${raw}`, { redirect: 'manual' });
const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
const { accessToken } = await (await fetch(`${API}/api/auth/refresh`, { method: 'POST', headers: { cookie } })).json();
const h = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
for (const message of process.argv.slice(2)) {
  const t0 = Date.now();
  const res = await fetch(`${API}/api/money/chat`, { method: 'POST', headers: h, body: JSON.stringify({ message, history: [] }) });
  const j = await res.json().catch(() => null);
  const d = j?.data || j;
  console.log(`[${Date.now() - t0} ms] ${res.status} ${JSON.stringify(message)}\n  -> ${JSON.stringify(d?.text || d?.error || j).slice(0, 400)}\n  figures: ${JSON.stringify((d?.figures || []).map((f) => f.kind + (f.category ? ':' + f.category : '')))} receipts: ${(d?.receipts || []).length}`);
}
