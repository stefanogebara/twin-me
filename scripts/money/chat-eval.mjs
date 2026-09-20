#!/usr/bin/env node
/**
 * The chat, evaluated: every scenario through the real model against a real ledger.
 * ===================================================================================
 * Runs tests/api/services/money/chatScenarios.js through POST /api/money/chat on a running
 * API (the local one on 3014 by default, signed in as the test user through the magic
 * link), scores each reply on what can be checked without opinion, and, with --judge, asks
 * the analysis-tier model one narrow question about each reply: did it address what was
 * typed. Writes a JSON record of the run and prints a table. The turns it creates are
 * deleted afterwards, so the person's conversation is not littered.
 *
 *   node scripts/money/chat-eval.mjs [--api http://127.0.0.1:3014] [--only id,id] [--judge] [--out dir]
 *
 * Checks (each pass/fail, the reply's own words never rewritten):
 *   figures   the kinds drawn are among the scenario's allowed kinds (or include one of "some")
 *   actions   the offers made match ("some" of the kinds, or none)
 *   length    at most maxSentences
 *   style     no markdown, no emoji, no talk of models or AI, no restating the question
 *   grounded  every amount in the text has a basis line (a context line sharing that amount)
 *   mention   the text matches every "mention" regex and none of the "avoid" ones
 *   judge     (with --judge) the model rates "addresses what was typed" 0..2; 0 fails
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { SCENARIOS, sentenceCount, amountsInText } from '../../tests/api/services/money/chatScenarios.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
const arg = (name, dflt = null) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const API = arg('--api', 'http://127.0.0.1:3014');
const ONLY = (arg('--only', '') || '').split(',').filter(Boolean);
const JUDGE = process.argv.includes('--judge');
/* The judge: DeepSeek flipped between 2 and 0 on the same reply across runs; a steadier reader by default. */
const JUDGE_MODEL = arg('--judge-model', 'google/gemini-2.5-flash');
const OUT = arg('--out', path.resolve(process.cwd(), '.claude/plans/2026-09-15-chat-evals/runs'));
const EMAIL = process.env.EVAL_EMAIL || 'stefanogebara@gmail.com';

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function signIn() {
  const raw = crypto.randomBytes(32).toString('hex');
  await sb.from('magic_link_tokens').insert({ token_hash: crypto.createHash('sha256').update(raw).digest('hex'), email: EMAIL, expires_at: new Date(Date.now() + 600000).toISOString() });
  const r = await fetch(`${API}/api/auth/magic-link/verify?token=${raw}`, { redirect: 'manual' });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  const rf = await fetch(`${API}/api/auth/refresh`, { method: 'POST', headers: { cookie } });
  const j = await rf.json();
  if (!j.accessToken) throw new Error('sign-in failed');
  const { data: u } = await sb.from('users').select('id').eq('email', EMAIL).single();
  return { token: j.accessToken, userId: u.id };
}

const STYLE_BAD = [/[*#_`]{1,}/, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, /\b(language model|as an ai|i am an ai|sou uma ia|soy una ia|llm)\b/i] /* OpenAI is a merchant in the ledger: never a style fault (2026-09-21) */;
function score(s, reply) {
  const text = String(reply.text || '');
  const kinds = (reply.figures || []).map((f) => f.kind);
  const acts = (reply.actions || []).map((a) => a.kind);
  const checks = {};
  checks.figures = s.figures.only ? kinds.every((k) => s.figures.only.includes(k)) : kinds.some((k) => s.figures.some.includes(k));
  checks.actions = s.actions.none ? acts.length === 0 : (s.actions.optional && acts.length === 0) || acts.some((k) => s.actions.some.includes(k));
  checks.length = sentenceCount(text) <= s.maxSentences;
  const restates = s.message.split(/\s+/).length > 3 && text.toLowerCase().startsWith(s.message.toLowerCase().slice(0, 24));
  checks.style = !STYLE_BAD.some((re) => re.test(text)) && !restates;
  const amounts = amountsInText(text);
  const basis = (reply.basis || []).join('\n');
  checks.grounded = amounts.every((a) => amountsInText(basis).some((b) => Math.abs(a - b) < 0.005)) || (amounts.length > 0 && !reply.basis && kinds.length > 0);
  checks.mention = (s.mention || []).every((re) => re.test(text)) && !(s.avoid || []).some((re) => re.test(text));
  return { checks, kinds, acts, sentences: sentenceCount(text), amounts };
}

async function judge(s, reply, token) {
  /* One narrow question to the analysis tier through the API's own gateway is not exposed;
     the runner asks OpenRouter directly with the same key, same model tier. */
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const body = {
    model: JUDGE_MODEL, temperature: 0, max_tokens: 160,
    messages: [
      { role: 'system', content: 'You grade one reply from a personal finance assistant that speaks for a ledger. Return JSON only: {"addresses": 0|1|2, "why": string}. addresses: 2 = the reply gives what the message asked for (a figure for a question about money, even in one terse line; for a statement, it says the thing back and offers to keep or act on it; for a greeting, a short greeting); 1 = it gives part of it; 0 = it answers a different question, ignores the message, or contradicts what the person said. Terseness is not a fault. A figure drawn counts as an answer when a chart was asked for.' },
      { role: 'user', content: `The person typed: ${s.message}\n\nThe reply: ${reply.text}\n\nOffers made: ${(reply.actions || []).map((a) => a.label).join('; ') || 'none'}\nFigures drawn: ${(reply.figures || []).map((f) => f.kind).join(', ') || 'none'}` },
    ],
  };
  let j = null;
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    j = await r.json().catch(() => null);
  } catch { return { addresses: null, why: 'judge unreachable' }; }
  const raw = j?.choices?.[0]?.message?.content || '';
  try { const o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); const n = Number(o.addresses); return { addresses: Number.isFinite(n) ? Math.max(0, Math.min(2, n)) : null, why: String(o.why || '').slice(0, 160) }; } catch { return { addresses: null, why: raw.slice(0, 160) }; }
}

(async () => {
  const startedAt = new Date().toISOString();
  const { token, userId } = await signIn();
  const list = ONLY.length ? SCENARIOS.filter((s) => ONLY.includes(s.id)) : SCENARIOS;
  const results = [];
  for (const s of list) {
    const t0 = Date.now();
    let reply = null, error = null;
    try {
      const r = await fetch(`${API}/api/money/chat`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ message: s.message, history: s.history || [] }) });
      const j = await r.json();
      reply = j.data || null; if (!j.success) error = j.error || `http ${r.status}`;
    } catch (e) { error = e.message; }
    const ms = Date.now() - t0;
    const sc = reply ? score(s, reply) : { checks: {}, kinds: [], acts: [], sentences: 0, amounts: [] };
    /* The shortcut's answers are templates; the judge has nothing to say about them. */
    const jd = reply && JUDGE && s.route !== 'short' ? await judge(s, reply, token) : null;
    if (jd) sc.checks.judge = jd.addresses === null ? true : jd.addresses > 0;
    const pass = !error && Object.values(sc.checks).every(Boolean);
    results.push({ id: s.id, kind: s.kind, message: s.message, ms, error, text: reply?.text || null, figures: sc.kinds, actions: sc.acts, sentences: sc.sentences, checks: sc.checks, judge: jd, pass });
    const failed = Object.entries(sc.checks).filter(([, v]) => !v).map(([k]) => k);
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${s.id.padEnd(22)} ${String(ms).padStart(6)} ms  fig=[${sc.kinds.join(',')}] act=[${sc.acts.join(',')}] sent=${sc.sentences}${failed.length ? '  failed: ' + failed.join(',') : ''}${jd ? `  judge=${jd.addresses}` : ''}${error ? '  ERROR ' + error : ''}`);
    console.log(`      ${String(reply?.text || '').replace(/\n/g, ' ').slice(0, 220)}`);
  }
  /* The turns this run wrote are not the person's conversation. */
  let cleaned = await sb.from('money_chat_turns').select('id').eq('user_id', userId).gte('created_at', startedAt);
  if (cleaned.error) cleaned = await sb.from('money_chat_turns').select('id').eq('user_id', userId).gte('created_at', startedAt); // one more try: a run once reported 0 cleaned and left 35 (2026-09-20)
  const turns = cleaned.data || [];
  if (cleaned.error) console.log(`turns could not be read: ${cleaned.error.message}; delete them by hand since ${startedAt}`);
  if (turns.length) { const { error } = await sb.from('money_chat_turns').delete().in('id', turns.map((t) => t.id)); if (error) console.log(`turns could not be deleted: ${error.message}`); }
  const passed = results.filter((r) => r.pass).length;
  const byCheck = {};
  for (const r of results) for (const [k, v] of Object.entries(r.checks)) { byCheck[k] = byCheck[k] || { pass: 0, fail: 0 }; byCheck[k][v ? 'pass' : 'fail'] += 1; }
  console.log(`\n${passed}/${results.length} passed. By check: ${Object.entries(byCheck).map(([k, v]) => `${k} ${v.pass}/${v.pass + v.fail}`).join(', ')}. Turns cleaned: ${turns?.length || 0}.`);
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${startedAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ startedAt, api: API, judge: JUDGE ? JUDGE_MODEL : null, passed, total: results.length, byCheck, results }, null, 1));
  console.log(`written ${file}`);
})().catch((e) => { console.error('eval failed:', e.message); process.exit(1); });
