#!/usr/bin/env node
/**
 * The morning line, measured: how many went out, how many were answered within a day, what it
 * cost. The stop rule was fixed before the first send (spec, section 4): after 21 days, fewer
 * than half answered means it is turned off.
 *
 *   node scripts/money/morning-report.mjs [--days 21] [--rate 0.012]
 */
import 'dotenv/config';
import { supabaseAdmin } from '../../api/services/database.js';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? Number(process.argv[i + 1]) : fallback; };
const days = arg('days', 21);
const rate = arg('rate', 0.012);
const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

const { data, error } = await supabaseAdmin.from('money_channel_sends').select('user_id, day, sent_at, replied_at, error').eq('kind', 'morning').gte('day', since).order('day');
if (error) { console.error(`Could not read the sends: ${error.message}`); process.exit(1); }

const sent = (data || []).filter((r) => r.sent_at);
const answered = sent.filter((r) => r.replied_at);
const refused = (data || []).filter((r) => r.error && r.error !== 'suppressed');
const people = new Set(sent.map((r) => r.user_id)).size;
const share = sent.length ? Math.round((answered.length / sent.length) * 100) : 0;
console.log(`Since ${since}: ${sent.length} lines to ${people} people, ${answered.length} answered within a day (${share}%), ${refused.length} refused.`);
console.log(`Cost at ${rate} EUR a message: ${(sent.length * rate).toFixed(2)} EUR.`);
console.log(share >= 50 ? 'Above the stop rule.' : sent.length ? 'Below the stop rule: half were not answered.' : 'Nothing sent yet.');
for (const r of refused.slice(-5)) console.log(`  refused ${r.day}: ${r.error}`);
