/**
 * The Ask benchmark runner: tests/api/services/money/chatBench.js against a running API.
 * ======================================================================================
 *   node scripts/money/chat-bench.mjs [--api http://127.0.0.1:3007] [--only id,id] [--dim learning,shape]
 *                                     [--judge] [--runs 1] [--out dir]
 *
 * For every scenario (or every step of a sequence) it asks, scores the reply on the checks of
 * chat-eval.mjs (figures, actions, length, style, grounded, mention) plus speed, records which
 * context lines grounded the answer (what it fetched), and, with --judge, asks one narrow
 * grader four questions: addresses 0..2, figure_fit 0..2, structure 0..2, honesty 0..2. A step
 * with `act` takes the first offer of that kind through POST /chat/act before the next step, so
 * a lesson is applied for real; everything a run wrote is undone at the end: chat turns, twin
 * memories, facts answered since the run began, place overrides, verdicts it set. Streamed
 * scenarios (`stream: true`) go through /chat/stream and keep the thinking for a reasoning grade.
 * Writes <out>/<timestamp>.json with per-dimension scores.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { BENCH, DIMENSIONS } from '../../tests/api/services/money/chatBench.js';
import { amountsInText } from '../../api/services/money/chat.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const API = arg('--api', 'http://127.0.0.1:3007');
const ONLY = (arg('--only', '') || '').split(',').filter(Boolean);
const DIMS = (arg('--dim', '') || '').split(',').filter(Boolean);
const JUDGE = process.argv.includes('--judge');
const RUNS = Math.max(1, Number(arg('--runs', '1')) || 1);
const JUDGE_MODEL = arg('--judge-model', 'google/gemini-2.5-flash');
const OUT = arg('--out', path.resolve(process.cwd(), '.claude/plans/2026-09-15-chat-evals/bench'));
const EMAIL = process.env.EVAL_EMAIL || 'stefanogebara@gmail.com';
const SPEED = { short: 3000, model: 25000, any: 25000 };

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function signIn() {
  const raw = crypto.randomBytes(32).toString('hex');
  await sb.from('magic_link_tokens').insert({ token_hash: crypto.createHash('sha256').update(raw).digest('hex'), email: EMAIL, expires_at: new Date(Date.now() + 600000).toISOString() });
  const r = await fetch(`${API}/api/auth/magic-link/verify?token=${raw}`, { redirect: 'manual' });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  const rf = await fetch(`${API}/api/auth/refresh`, { method: 'POST', headers: { cookie } });
  const j = await rf.json().catch(() => ({}));
  if (!j.accessToken) throw new Error(`sign-in failed: verify ${r.status}, cookie ${cookie ? cookie.slice(0, 14) + '...' : 'missing'}, refresh ${rf.status} ${JSON.stringify(j).slice(0, 120)}`);
  const { data: u } = await sb.from('users').select('id').eq('email', EMAIL).single();
  return { token: j.accessToken, userId: u.id };
}

const sentenceCount = (t) => String(t || '').split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý¿¡])/).filter((x) => x.trim()).length;
const STYLE_BAD = [/[*#_`]{1,}/, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, /\b(language model|as an ai|i am an ai|sou uma ia|soy una ia|llm)\b/i];
const heading = (line) => String(line).split(':')[0].replace(/\s*\(.*$/, '').replace(/\d[\d.,]*\s*(EUR|€)?/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);

function score(s, reply, ms) {
  const text = String(reply.text || '');
  const kinds = (reply.figures || []).map((f) => f.kind);
  const acts = (reply.actions || []).map((a) => a.kind);
  const checks = {};
  const fig = s.figures || { only: [] };
  checks.figures = fig.only ? kinds.every((k) => fig.only.includes(k)) : kinds.some((k) => fig.some.includes(k));
  if (s.figureCategory) checks.figures = checks.figures && (reply.figures || []).some((f) => f.kind === 'shares' && f.category === s.figureCategory && f.by === 'merchant');
  const act = s.actions || { none: true };
  checks.actions = act.none ? acts.length === 0 : (act.optional && acts.length === 0) || acts.some((k) => act.some.includes(k));
  checks.length = sentenceCount(text) <= (s.maxSentences || 4);
  const restates = s.message.split(/\s+/).length > 3 && text.toLowerCase().startsWith(s.message.toLowerCase().slice(0, 24));
  checks.style = !STYLE_BAD.some((re) => re.test(text)) && !restates;
  const amounts = amountsInText(text);
  const typed = [...String(s.message || '').matchAll(/\b(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\b/g)].map((m) => Number(`${m[1].replace(/\./g, '')}.${(m[2] || '00').padEnd(2, '0')}`));
  const basis = (reply.basis || []).join('\n');
  checks.grounded = amounts.every((a) => amountsInText(basis).some((b) => Math.abs(a - b) < 0.005) || typed.some((b) => Math.abs(a - b) < 0.005)) || (amounts.length > 0 && !reply.basis && kinds.length > 0);
  checks.mention = (s.mention || []).every((re) => re.test(text)) && !(s.avoid || []).some((re) => re.test(text));
  checks.speed = ms <= (s.speedMs || SPEED[s.route] || SPEED.any);
  const fetched = [...new Set((reply.basis || []).map(heading).filter(Boolean))];
  return { checks, kinds, acts, sentences: sentenceCount(text), amounts, fetched };
}

async function grade(s, reply, thinking) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const figs = (reply.figures || []).map((f) => `${f.kind}${f.category ? ':' + f.category : ''}${f.title ? ` "${f.title}"` : ''}${f.items ? ` (${f.items.length} rows)` : ''}${f.points ? ` (${f.points.length} points)` : ''}`).join('; ') || 'none';
  const system = 'You grade one reply from a personal finance assistant that speaks only from a ledger of the person\'s own payments. Return JSON only: {"addresses":0|1|2,"figure_fit":0|1|2,"structure":0|1|2,"honesty":0|1|2,"reasoning":0|1|2|null,"why":string}. addresses: 2 gives what was asked (a figure for a money question, an offer for a statement, a plain refusal for something the ledger cannot know), 1 partly, 0 no. figure_fit: 2 the chart drawn is the one that shows the answer, or rightly none when a number is enough; 1 a chart that helps a little or is missing when it would help; 0 a wrong or noisy chart. structure: 2 leads with the answer, one idea per sentence, no dump of unrelated figures; 1 readable but padded or out of order; 0 a wall or a list dressed as prose. honesty: 2 every figure is from the ledger and it says plainly what it cannot tell; 1 hedged; 0 invents, averages, adds or predicts beyond the ledger. reasoning: when a thinking transcript is given, 2 if it reads the right lines and checks itself, 1 if it wanders, 0 if it ignores the data; null when no transcript. why: one sentence.';
  const user = `The person typed: ${s.message}${s.history?.length ? `\n\nEarlier turns: ${s.history.map((h) => `${h.role}: ${h.text}`).join(' | ')}` : ''}\n\nThe reply: ${reply.text}\n\nFigures drawn: ${figs}\nOffers made: ${(reply.actions || []).map((a) => `${a.kind}: ${a.label}`).join('; ') || 'none'}\nLines it read from: ${(reply.basis || []).slice(0, 6).join(' | ') || 'none recorded'}${thinking ? `\n\nThinking transcript: ${thinking.slice(0, 1500)}` : ''}`;
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: JUDGE_MODEL, temperature: 0, max_tokens: 220, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
    const j = await r.json();
    const raw = j?.choices?.[0]?.message?.content || '';
    const o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const n = (v) => (v === null || v === undefined ? null : Math.max(0, Math.min(2, Number(v))));
    return { addresses: n(o.addresses), figure_fit: n(o.figure_fit), structure: n(o.structure), honesty: n(o.honesty), reasoning: thinking ? n(o.reasoning) : null, why: String(o.why || '').slice(0, 200) };
  } catch (e) { return { addresses: null, figure_fit: null, structure: null, honesty: null, reasoning: null, why: `grader failed: ${e.message}` }; }
}

async function ask(token, message, history, stream) {
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  if (!stream) {
    const r = await fetch(`${API}/api/money/chat`, { method: 'POST', headers, body: JSON.stringify({ message, history }) });
    const j = await r.json();
    if (!j.success) throw new Error(j.error || `http ${r.status}`);
    return { ...j.data, thinking: '' };
  }
  const r = await fetch(`${API}/api/money/chat/stream`, { method: 'POST', headers: { ...headers, accept: 'text/event-stream' }, body: JSON.stringify({ message, history }) });
  if (!r.ok) throw new Error(`http ${r.status}`);
  const got = { text: '', figures: [], actions: [], receipts: [], basis: [], thinking: '' }; let done = false; let failed = null;
  for (const block of (await r.text()).split('\n\n')) {
    const line = block.split('\n').find((l) => l.startsWith('data:')); if (!line) continue;
    let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
    if (ev.phase === 'text') got.text += (got.text && !/\s$/.test(got.text) && !/^\s/.test(ev.delta) ? ' ' : '') + ev.delta;
    else if (ev.phase === 'thinking') got.thinking += ev.delta;
    else if (ev.phase === 'figures') got.figures = ev.figures || [];
    else if (ev.phase === 'actions') { got.actions = ev.actions || []; got.receipts = ev.receipts || []; got.basis = ev.basis || []; }
    else if (ev.phase === 'done') done = true;
    else if (ev.phase === 'failed') failed = ev.detail || 'failed';
  }
  got.text = got.text.replace(/\s+/g, ' ').trim();
  if (failed) throw new Error(failed);
  if (!done) throw new Error('stream ended without done');
  return got;
}

async function take(token, action) {
  const r = await fetch(`${API}/api/money/chat/act`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
  const j = await r.json();
  return j.success ? j.data : { done: false, said: j.error || `http ${r.status}` };
}

(async () => {
  const startedAt = new Date().toISOString();
  const { token, userId } = await signIn();
  let list = BENCH;
  if (ONLY.length) list = list.filter((s) => ONLY.includes(s.id));
  if (DIMS.length) list = list.filter((s) => DIMS.includes(s.dim));
  const results = [];
  const acted = { verdicts: [] };
  const runOne = async (s, step, history, label) => {
    const scenario = { ...s, ...step, id: label };
    const t0 = Date.now();
    let reply = null; let error = null;
    try { reply = await ask(token, scenario.message, step.history || history, Boolean(s.stream || step.stream)); } catch (e) { error = e.message; }
    const ms = Date.now() - t0;
    const sc = reply ? score(scenario, reply, ms) : { checks: {}, kinds: [], acts: [], sentences: 0, amounts: [], fetched: [] };
    /* a computed reply ("Noted: ...", the offer as the answer) is a template, like the short route */
    const computed = /^(Noted|Anotado):/.test(String(reply?.text || ''));
    const jd = reply && JUDGE && scenario.route !== 'short' && scenario.judge !== false && !computed ? await grade(scenario, reply, reply.thinking) : null;
    if (jd && jd.addresses !== null) sc.checks.judge = jd.addresses > 0;
    const pass = !error && Object.values(sc.checks).every(Boolean);
    let took = null;
    if (reply && step.act) {
      const want = step.act === true ? (reply.actions || [])[0] : (reply.actions || []).find((a) => a.kind === step.act);
      if (want) { took = await take(token, want); if (want.kind === 'not_me' && want.transaction_id) acted.verdicts.push(want.transaction_id); }
      else took = { done: false, said: `no ${step.act} offer to take` };
      sc.checks.acted = Boolean(took?.done);
    }
    const failed = Object.entries(sc.checks).filter(([, v]) => !v).map(([k]) => k);
    const passAll = pass && (took ? took.done : true);
    results.push({ id: label, dim: s.dim, message: scenario.message, ms, error, text: reply?.text || null, figures: (reply?.figures || []).map((f) => f.kind + (f.category ? ':' + f.category : '')), actions: sc.acts, receipts: (reply?.receipts || []).length, fetched: sc.fetched, sentences: sc.sentences, checks: sc.checks, judge: jd, took: took?.said || null, thinking: reply?.thinking ? reply.thinking.slice(0, 600) : null, pass: passAll });
    console.log(`${passAll ? 'PASS' : 'FAIL'}  ${label.padEnd(24)} ${String(ms).padStart(6)} ms  fig=[${results.at(-1).figures.join(',')}] act=[${sc.acts.join(',')}] rec=${results.at(-1).receipts}${failed.length ? '  failed: ' + failed.join(',') : ''}${jd ? `  j=${jd.addresses}/${jd.figure_fit}/${jd.structure}/${jd.honesty}${jd.reasoning !== null ? '/' + jd.reasoning : ''}` : ''}${took ? `  took: ${String(took.said).slice(0, 60)}` : ''}`);
    console.log(`      ${String(reply?.text || error || '').replace(/\n/g, ' ').slice(0, 230)}`);
    return { reply, took };
  };
  for (const s of list.flatMap((x) => Array.from({ length: RUNS }, () => x))) {
    if (s.steps) {
      const history = [];
      for (let i = 0; i < s.steps.length; i += 1) {
        const step = s.steps[i];
        const { reply, took } = await runOne(s, step, [...history], `${s.id}#${i + 1}`);
        history.push({ role: 'user', text: step.message });
        if (reply?.text) history.push({ role: 'twin', text: took?.said ? `${reply.text} ${took.said}` : reply.text });
      }
    } else await runOne(s, {}, s.history || [], s.id);
  }

  /* undo everything a run wrote */
  const undo = {};
  const del = async (table, col, extra = (q) => q) => { let q = sb.from(table).select(col === 'user_id' ? 'user_id' : 'id').eq('user_id', userId); q = extra(q); const { data } = await q; const ids = (data || []).map((r) => r.id ?? r.user_id); if (!ids.length) return 0; return ids.length; };
  const turns = await sb.from('money_chat_turns').select('id').eq('user_id', userId).gte('created_at', startedAt);
  if (turns.data?.length) await sb.from('money_chat_turns').delete().in('id', turns.data.map((t) => t.id)); undo.turns = turns.data?.length || 0;
  const mem = await sb.from('user_memories').select('id').eq('user_id', userId).gte('created_at', startedAt);
  if (mem.data?.length) await sb.from('user_memories').delete().in('id', mem.data.map((t) => t.id)); undo.memories = mem.data?.length || 0;
  const facts = await sb.from('money_facts').select('id').eq('user_id', userId).gte('answered_at', startedAt);
  if (facts.data?.length) await sb.from('money_facts').delete().in('id', facts.data.map((t) => t.id)); undo.facts = facts.data?.length || 0;
  const asked = await sb.from('money_questions_asked').delete().eq('user_id', userId).gte('asked_at', startedAt).select('question_id'); undo.questions = asked.data?.length || 0;
  const overrides = await sb.from('money_place_overrides').delete().eq('user_id', userId).gte('created_at', startedAt).select('merchant_key'); undo.overrides = overrides.data?.length || 0;
  if (acted.verdicts.length) { await sb.from('money_transactions').update({ verdict: null }).eq('user_id', userId).in('id', acted.verdicts); } undo.verdicts = acted.verdicts.length;
  void del;

  /* scores */
  const byDim = {};
  for (const d of DIMENSIONS) {
    const rows = results.filter((r) => r.dim === d);
    if (!rows.length) continue;
    const j = rows.map((r) => r.judge).filter(Boolean);
    const mean = (k) => { const v = j.map((x) => x[k]).filter((x) => x !== null && x !== undefined); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null; };
    byDim[d] = { n: rows.length, passed: rows.filter((r) => r.pass).length, medianMs: rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)], judge: { addresses: mean('addresses'), figure_fit: mean('figure_fit'), structure: mean('structure'), honesty: mean('honesty'), reasoning: mean('reasoning') } };
  }
  const byCheck = {};
  for (const r of results) for (const [k, v] of Object.entries(r.checks)) { byCheck[k] = byCheck[k] || { pass: 0, fail: 0 }; byCheck[k][v ? 'pass' : 'fail'] += 1; }
  const fetchedCounts = {};
  for (const r of results) for (const h of r.fetched) fetchedCounts[h] = (fetchedCounts[h] || 0) + 1;
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed. By check: ${Object.entries(byCheck).map(([k, v]) => `${k} ${v.pass}/${v.pass + v.fail}`).join(', ')}.`);
  console.log('By dimension: ' + Object.entries(byDim).map(([d, v]) => `${d} ${v.passed}/${v.n} (${v.medianMs} ms${v.judge.addresses !== null ? `, j ${v.judge.addresses}/${v.judge.figure_fit}/${v.judge.structure}/${v.judge.honesty}` : ''})`).join('; '));
  console.log('Undone: ' + JSON.stringify(undo));
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${startedAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ startedAt, api: API, judge: JUDGE ? JUDGE_MODEL : null, passed, total: results.length, byCheck, byDim, fetched: fetchedCounts, undo, results }, null, 1));
  console.log(`written ${file}`);
  /* The chat module's imports hold queue connections open; the run is done. */
  process.exit(0);
})();
