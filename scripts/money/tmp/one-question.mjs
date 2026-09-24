import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const API = 'http://127.0.0.1:3007';
const EMAIL = 'stefanogebara@gmail.com';
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const raw = crypto.randomBytes(32).toString('hex');
await sb.from('magic_link_tokens').insert({ token_hash: crypto.createHash('sha256').update(raw).digest('hex'), email: EMAIL, expires_at: new Date(Date.now() + 600000).toISOString() });
const r = await fetch(`${API}/api/auth/magic-link/verify?token=${raw}`, { redirect: 'manual' });
const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
const rf = await fetch(`${API}/api/auth/refresh`, { method: 'POST', headers: { cookie } });
const { accessToken } = await rf.json();
const history = [
  { role: 'user', text: 'How much did I spend this week?' },
  { role: 'twin', text: 'This week you spent 188,34 EUR in 14 payments, the largest El Corte Ingles 101,39 EUR.' },
];
for (const message of ['en español, por favor', 'em português, por favor', 'in english please']) {
  const res = await fetch(`${API}/api/money/chat`, { method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ message, history }) });
  const j = await res.json();
  console.log(`\n${message}\n  -> ${(j.data?.text || JSON.stringify(j)).slice(0, 240)}`);
  console.log(`     figures ${JSON.stringify((j.data?.figures || []).map((f) => f.kind))} computed=${Boolean(j.data?.computed)}`);
}
process.exit(0);
