/** Read-only evidence report. There is deliberately no apply/delete mode. */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => i % 2 ? pairs : [...pairs, [value, all[i + 1]]], []));
const userId = args['--user-id'];
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId || '') || !args['--output']) {
  throw new Error('Required: --user-id UUID --output /private/path/report.json; optional --env-file PATH');
}
if (args['--env-file']) dotenv.config({ path: args['--env-file'], quiet: true });
const output = path.resolve(args['--output']);
if (output.startsWith(`${process.cwd()}${path.sep}`)) throw new Error('Keep financial evidence outside the checkout');
const project = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
const query = `
WITH evidence AS (
 SELECT id,account_id,transaction_id,source,source_ref,amount,currency,occurred_at,
        raw_json->>'entry_reference' AS provider_ref,raw_json->>'status' AS status
 FROM money_sightings WHERE user_id='${userId}'
), exact_provider AS (
 SELECT account_id,provider_ref,jsonb_agg(to_jsonb(e)) AS evidence
 FROM evidence e WHERE source='bankfeed' AND provider_ref IS NOT NULL AND account_id IS NOT NULL
 GROUP BY account_id,provider_ref HAVING count(DISTINCT transaction_id)>1
), ambiguous AS (
 SELECT account_id,currency,amount,merchant_key,occurred_at::date AS day,
        array_agg(id) AS transaction_ids,array_agg(verdict) AS verdicts
 FROM money_transactions WHERE user_id='${userId}' AND posted_at IS NOT NULL
 GROUP BY account_id,currency,amount,merchant_key,occurred_at::date HAVING count(*)>1
)
SELECT jsonb_build_object(
 'exact_provider_candidates',COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM exact_provider e),'[]'::jsonb),
 'ambiguous_same_day_payments',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM ambiguous a),'[]'::jsonb),
 'unlinked_evidence',COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM evidence e WHERE transaction_id IS NULL),'[]'::jsonb),
 'transactions_without_primary_evidence',COALESCE((SELECT jsonb_agg(t.id) FROM money_transactions t
 LEFT JOIN money_sightings s ON s.id=t.primary_sighting_id AND s.user_id=t.user_id AND s.transaction_id=t.id
 WHERE t.user_id='${userId}' AND s.id IS NULL),'[]'::jsonb)
) AS report;`;
const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, read_only: true }), signal: AbortSignal.timeout(20000),
});
if (!response.ok) throw new Error(`Read-only diagnostics refused (${response.status})`);
const rows = await response.json();
const report = { generated_at: new Date().toISOString(), user_id: userId, mode: 'read-only',
  warning: 'Candidates are evidence for review, not proof of duplicate purchases. Preserve all manual corrections.', ...rows[0].report };
fs.writeFileSync(output, `${JSON.stringify(report,null,2)}\n`, { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ output, counts: Object.fromEntries(Object.entries(report).filter(([,v]) => Array.isArray(v)).map(([k,v]) => [k,v.length])) }));
