/* Forget what the stranger walk wrote: the statement account, its sightings, transactions, readings, chat turns, figures. The users row stays. */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config({ path: '.env', quiet: true });
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: u } = await sb.from('users').select('id').eq('email', 'stefanogebara+stranger0913@gmail.com').single();
for (const t of ['money_chat_turns', 'money_readings', 'money_figure_scores', 'money_predictions', 'money_recurring', 'money_transactions', 'money_sightings', 'money_ingestion_revisions', 'money_accounts', 'money_feed_accesses']) {
  const r = await sb.from(t).delete().eq('user_id', u.id).select('id');
  console.log(t, r.error ? `err ${r.error.message}` : `${(r.data || []).length} gone`);
}
const f = await sb.from('money_facts').delete().eq('user_id', u.id).neq('kind', 'note').select('id'); console.log('money_facts (kept notes)', f.error ? f.error.message : `${(f.data || []).length} gone`);
await sb.from('users').update({ preferred_language: null }).eq('id', u.id); console.log('language reset');
