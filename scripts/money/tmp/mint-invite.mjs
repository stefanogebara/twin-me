import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const email = process.argv[2];
const name = process.argv[3] || null;
if (!email) { console.error('an email is required'); process.exit(1); }
/* already invited? then reuse, so nobody gets two codes */
const { data: had } = await sb.from('beta_invite_codes').select('code, use_count, expires_at').eq('created_for_email', email).order('created_at', { ascending: false }).limit(1);
if (had && had.length && !had[0].use_count) { console.log(`existing ${email} ${had[0].code}`); process.exit(0); }
const code = crypto.randomBytes(4).toString('hex');
const { error } = await sb.from('beta_invite_codes').insert({
  code, created_for_email: email, created_for_name: name, max_uses: 1,
  expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  metadata: { minted_for: 'money pilot, 2026-09-24' },
});
if (error) { console.error('not minted:', error.message); process.exit(1); }
console.log(`minted ${email} ${code}`);
process.exit(0);
