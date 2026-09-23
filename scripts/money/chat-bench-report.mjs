/**
 * Renders a chat-bench.mjs JSON record as one HTML page in the register: the scorecard by
 * dimension, what the chat read from, and every question with its answer, figures, offers,
 * checks and grades.   node scripts/money/chat-bench-report.mjs <run.json> <out.html>
 */
import fs from 'node:fs';
const [, , inFile, outFile] = process.argv;
const run = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const grade = (v) => (v === null || v === undefined ? '' : v.toFixed(2));
const DIM_WORDS = { 'figure-yes': 'A chart drawn unasked, when it shows the answer', 'figure-no': 'No chart when a number is enough', shape: 'The shape of an answer: leads with the figure, one idea per sentence', grounding: 'Every figure from the ledger; refuses to add, average or predict', 'follow-up': 'A short follow-up carries the question before it', learning: 'Told something, offers the card, applies the lesson when asked again', correction: 'Told it is wrong, offers the fix without arguing', language: 'Answers in the language written', edge: 'Nonsense, out of scope, instructions, safety', reasoning: 'Streamed thinking on the open questions, graded on the transcript' };
const dims = Object.entries(run.byDim);
const failing = run.results.filter((r) => !r.pass);
const fetched = Object.entries(run.fetched || {}).sort((a, b) => b[1] - a[1]).slice(0, 18);
const rowsHtml = run.results.map((r) => {
  const bad = Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k);
  const j = r.judge;
  return `<details class="q${r.pass ? '' : ' fail'}"><summary><span class="id">${esc(r.id)}</span><span class="msg">${esc(r.message)}</span><span class="meta">${r.ms} ms${r.figures.length ? ' · ' + esc(r.figures.join(', ')) : ''}${r.actions.length ? ' · offer ' + esc(r.actions.join(', ')) : ''}${j && j.addresses !== null ? ` · ${j.addresses}/${j.figure_fit}/${j.structure}/${j.honesty}` : ''}${bad.length ? ' · <b>' + esc(bad.join(', ')) + '</b>' : ''}</span></summary><p class="ans">${esc(r.text || r.error || '')}</p>${r.took ? `<p class="took">Took the offer: ${esc(r.took)}</p>` : ''}${j ? `<p class="why">${esc(j.why)}</p>` : ''}${r.fetched?.length ? `<p class="fetched">Read from: ${esc(r.fetched.join('; '))}${r.receipts ? ` · ${r.receipts} receipts` : ''}</p>` : ''}${r.thinking ? `<p class="think">Thinking: ${esc(r.thinking)}</p>` : ''}</details>`;
}).join('\n');
const html = `<title>Ask Benchmark</title>
<style>
:root{--bg:#fbfaf9;--ink:#251f21;--ink2:#585254;--ink3:#6c6867;--line:#eae9ea;--field:#f4efec;--ok:#3d7566;--danger:#c42533;--accent:#0096ba}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17151a;--ink:#f2eeee;--ink2:#c9c3c4;--ink3:#a49d9e;--line:#2a2629;--field:#231f22;--ok:#7dbba9;--danger:#f08a92;--accent:#5cc3dd}}
:root[data-theme="dark"]{--bg:#17151a;--ink:#f2eeee;--ink2:#c9c3c4;--ink3:#a49d9e;--line:#2a2629;--field:#231f22;--ok:#7dbba9;--danger:#f08a92;--accent:#5cc3dd}
body{background:var(--bg);color:var(--ink);font-family:"Geist","Inter",system-ui,sans-serif;font-size:14px;line-height:1.5;padding-block:48px 96px;padding-inline:clamp(16px,5vw,48px);font-variant-numeric:tabular-nums}
main{max-width:900px;margin:0 auto}h1{font-weight:300;font-size:clamp(32px,5vw,44px);letter-spacing:-.04em;line-height:1.02;margin:0 0 8px;text-wrap:balance}.sub{color:var(--ink2);margin:0 0 36px;max-width:64ch}
h2{font-weight:400;font-size:22px;letter-spacing:-.02em;margin:52px 0 6px;text-wrap:balance}.lead{color:var(--ink2);margin:0 0 18px;max-width:66ch}
.big{display:flex;gap:28px;flex-wrap:wrap;border-top:1px solid var(--ink);padding-top:18px}.big div{min-width:120px}.big .g{font-size:40px;font-weight:300;letter-spacing:-.04em;line-height:1}.big .l{color:var(--ink3);font-size:13px;margin-top:6px}
.tablewrap{overflow-x:auto;border-top:1px solid var(--ink)}table{width:100%;border-collapse:collapse;min-width:640px}th,td{text-align:left;padding:10px 10px 10px 0;border-bottom:1px solid var(--line);vertical-align:top}th{font-weight:500;color:var(--ink2);font-size:13px}td.num,th.num{text-align:right;white-space:nowrap}
.ok{color:var(--ok)}.bad{color:var(--danger)}
details.q{border-bottom:1px solid var(--line);padding:10px 0}details.q summary{cursor:pointer;display:grid;grid-template-columns:150px 1fr auto;gap:12px;align-items:baseline;list-style:none}details.q summary::-webkit-details-marker{display:none}
.id{color:var(--ink3);font-size:12px;font-family:"Geist Mono",ui-monospace,monospace}.msg{font-weight:500}.meta{color:var(--ink3);font-size:12px;white-space:nowrap}details.fail .msg{color:var(--danger)}
.ans{margin:8px 0 4px 162px;max-width:70ch}.took,.why,.fetched,.think{margin:2px 0 2px 162px;color:var(--ink3);font-size:13px;max-width:70ch}.think{white-space:pre-wrap}
.list{border-top:1px solid var(--ink);margin:0;padding:0;list-style:none}.list li{padding:12px 0;border-bottom:1px solid var(--line);display:grid;grid-template-columns:1fr auto;gap:16px}.list li span:last-child{color:var(--ink3);white-space:nowrap}
.note{color:var(--ink3);font-size:13px;margin-top:24px;max-width:66ch}
@media (max-width:640px){details.q summary{grid-template-columns:1fr}.ans,.took,.why,.fetched,.think{margin-left:0}.list li{grid-template-columns:1fr}}
</style>
<main>
<h1>Ask Benchmark</h1>
<p class="sub">${run.total} questions, statements and corrections put to the money chat against the real ledger on ${esc(run.startedAt.slice(0, 10))}, each scored on what can be checked (the figures drawn, the offers made, the grounding of every amount, the words, the speed) and graded by a reader on four questions: does it address what was typed, is the chart the right one or rightly absent, does the shape lead with the answer, does it say what it cannot rather than guess. Grades are 0 to 2.</p>
<div class="big"><div><div class="g">${pct(run.passed, run.total)}%</div><div class="l">${run.passed} of ${run.total} pass every check</div></div>${['addresses', 'figure_fit', 'structure', 'honesty'].map((k) => { const v = dims.map(([, d]) => d.judge[k]).filter((x) => x !== null); const m = v.length ? (v.reduce((a, b) => a + b, 0) / v.length) : null; return `<div><div class="g">${m === null ? '' : m.toFixed(2)}</div><div class="l">${k.replace('_', ' ')}, mean of 2</div></div>`; }).join('')}</div>

<h2>By dimension</h2>
<p class="lead">What each dimension asks of the chat, and how it did. Median time is wall-clock from the question to the whole answer, figures and receipts included.</p>
<div class="tablewrap"><table><thead><tr><th>Dimension</th><th>What is asked</th><th class="num">Pass</th><th class="num">Median</th><th class="num">Addresses</th><th class="num">Figure fit</th><th class="num">Structure</th><th class="num">Honesty</th><th class="num">Reasoning</th></tr></thead><tbody>
${dims.map(([d, v]) => `<tr><td>${esc(d)}</td><td>${esc(DIM_WORDS[d] || '')}</td><td class="num ${v.passed === v.n ? 'ok' : v.passed < v.n * 0.7 ? 'bad' : ''}">${v.passed}/${v.n}</td><td class="num">${(v.medianMs / 1000).toFixed(1)} s</td><td class="num">${grade(v.judge.addresses)}</td><td class="num">${grade(v.judge.figure_fit)}</td><td class="num">${grade(v.judge.structure)}</td><td class="num">${grade(v.judge.honesty)}</td><td class="num">${grade(v.judge.reasoning)}</td></tr>`).join('\n')}
</tbody></table></div>

<h2>By check</h2>
<div class="tablewrap"><table><thead><tr><th>Check</th><th class="num">Pass</th><th class="num">Fail</th></tr></thead><tbody>
${Object.entries(run.byCheck).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num ok">${v.pass}</td><td class="num ${v.fail ? 'bad' : ''}">${v.fail}</td></tr>`).join('\n')}
</tbody></table></div>

<h2>What it read from</h2>
<p class="lead">The context lines that grounded the amounts in the answers, counted across the run: what the chat fetches and quotes.</p>
<ul class="list">${fetched.map(([h, n]) => `<li><span>${esc(h)}</span><span>${n}</span></li>`).join('')}</ul>

<h2>What failed</h2>
<p class="lead">${failing.length} of ${run.total}. The check that failed is in bold on each line; open one for the answer and the grader's sentence.</p>
${failing.map((r) => `<details class="q fail"><summary><span class="id">${esc(r.id)}</span><span class="msg">${esc(r.message)}</span><span class="meta">${r.ms} ms · <b>${esc(Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k).join(', ') || r.error || '')}</b></span></summary><p class="ans">${esc(r.text || r.error || '')}</p>${r.judge ? `<p class="why">${esc(r.judge.why)}</p>` : ''}</details>`).join('\n')}

<h2>Every question</h2>
<p class="lead">In the order asked. Sequences carry a step number; a step that took an offer says what the ledger did with it.</p>
${rowsHtml}
<p class="note">Runner: scripts/money/chat-bench.mjs over tests/api/services/money/chatBench.js, against ${esc(run.api)}${run.judge ? `, grader ${esc(run.judge)}` : ''}. Everything the run wrote was undone: ${esc(JSON.stringify(run.undo))}.</p>
</main>`;
fs.writeFileSync(outFile, html);
console.log(`wrote ${outFile}`);
