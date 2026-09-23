/* Why did "what comes back" take 27 s right after a cancellation fact? Time gather() before and after such a fact, then remove it. */
import dotenv from 'dotenv'; dotenv.config({ path: '.env', quiet: true });
const U = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';
const { gather } = await import('../../../api/services/money/chat.js');
const store = await import('../../../api/services/money/store.js');
const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const time = async (label) => { const t0 = Date.now(); await gather(U, new Date()); console.log(label, Date.now() - t0, 'ms'); };
await time('gather warm 1'); await time('gather warm 2');
const before = new Date().toISOString();
await store.answerQuestion(U, { questionId: null, kind: 'merchant_kind', subject: 'higgsfield', subjectLabel: 'Higgsfield', value: 'cancelled' });
await time('gather after cancel 1'); await time('gather after cancel 2');
const { data } = await sb.from('money_facts').select('id').eq('user_id', U).eq('kind', 'merchant_kind').eq('subject', 'higgsfield').gte('answered_at', before);
for (const f of data || []) await sb.from('money_facts').delete().eq('id', f.id);
console.log('fact removed:', (data || []).length);
await time('gather restored');
process.exit(0);
