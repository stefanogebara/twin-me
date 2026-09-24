import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: accounts } = await sb.from('money_accounts').select('id, user_id, provider, name, iban_mask, session_id, consent_expires_at, created_at').eq('provider', 'enablebanking');
console.log('enablebanking accounts:', (accounts || []).length);
for (const a of accounts || []) console.log(' ', (a.name || '').slice(0, 26).padEnd(26), a.iban_mask || '', 'consent to', String(a.consent_expires_at || '').slice(0, 10), 'user', String(a.user_id).slice(0, 8));
const { count: users } = await sb.from('users').select('id', { count: 'exact', head: true });
console.log('people with an account on TwinMe:', users);
process.exit(0);
