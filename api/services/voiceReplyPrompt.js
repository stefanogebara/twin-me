/**
 * voiceReplyPrompt — the pure, dependency-free core of the voice-reply skill (M1).
 *
 * This module holds the two pieces where "sounds like me" is actually won or
 * lost: prompt assembly and model-response parsing (incl. the honesty guard on
 * the "why" chips). It performs NO I/O — no DB, no LLM, no imports — so it is
 * unit-testable in isolation. voiceReplyService.js wires the real personality /
 * memory / LLM collaborators around it.
 *
 * Contract (see .claude/plans/2026-07-05-m1-heartbeat):
 *  - Assemble a system+user prompt carrying VOICE + RELATIONSHIP register +
 *    situational MEMORIES + learned DIRECTIVES + the THREAD.
 *  - The model returns JSON { draft, why: [{kind, note}] }.
 *  - Honesty guard: a "why" chip that claims a memory or a directive is dropped
 *    unless that context was actually supplied — a fabricated reason erodes
 *    trust worse than no chip at all.
 */

const WHY_KINDS = new Set(['voice', 'register', 'memory', 'directive']);
const MAX_WHY = 3;
const MAX_NOTE = 60;
const THREAD_TAIL = 4; // include at most the last N thread messages

/**
 * @param {object} ctx
 * @param {{name?:string, handle?:string}} [ctx.counterpart]
 * @param {string} [ctx.voiceInstructions]  from personalityPromptBuilder
 * @param {object|null} [ctx.stylometrics]   {avgSentenceWords, vocabulary, formality, emoji, signoff}
 * @param {string|null} [ctx.register]       how the user writes to THIS person
 * @param {Array<{content:string}>} [ctx.memories]    relevant, may be []
 * @param {Array<{content:string}>} [ctx.directives]  learned corrections, may be []
 * @param {{subject?:string, messages?:Array<{author?:string,text?:string}>}} [ctx.thread]
 * @returns {{ system:string, user:string, messages:Array<{role:string,content:string}> }}
 */
export function buildVoiceReplyPrompt(ctx = {}) {
  const counterpartName = ctx.counterpart?.name || ctx.counterpart?.handle || 'them';
  const sty = ctx.stylometrics;
  const lines = [];

  lines.push(
    'You are drafting a reply AS the user, in their own voice — not as an assistant.',
    'It must read as if the user wrote it themselves. Never mention being an AI. Never invent facts.',
    '',
    '=== HOW THIS USER WRITES (voice) ===',
    (ctx.voiceInstructions || '(voice profile still forming — infer a natural, consistent voice)').trim(),
  );
  if (sty) {
    lines.push(
      `Stylometrics: avg sentence ~${num(sty.avgSentenceWords)} words; vocabulary ${sty.vocabulary || 'natural'}; ` +
      `formality ${num(sty.formality)}; emoji ${sty.emoji || 'rare'}; typical sign-off "${sty.signoff || ''}".`,
    );
  }
  lines.push(
    '',
    `=== HOW THEY WRITE TO ${counterpartName.toUpperCase()} (register) ===`,
    ctx.register && ctx.register.trim()
      ? ctx.register.trim()
      : `No prior history with ${counterpartName} — use the user's general voice; lean slightly warmer for a first exchange.`,
    '',
    '=== RELEVANT CONTEXT (use only if natural; never force) ===',
    list(ctx.memories, '(none relevant)'),
    '',
    '=== LEARNED CORRECTIONS (apply strictly) ===',
    list(ctx.directives, '(none yet)'),
    '',
    "TASK — Draft the user's reply. Match their voice AND their register with this person.",
    'Keep it the length they would actually write. Use scheduling availability only if it',
    'appears in the context above; otherwise state no facts that were not given.',
    '',
    'Return ONLY minified JSON, no prose, of the shape:',
    '{"draft":"<ready-to-send reply>","why":[{"kind":"voice|register|memory|directive","note":"<=8 words"}]}',
    `Include at most ${MAX_WHY} "why" entries, each citing a real choice made from the context above.`,
  );

  const system = lines.join('\n');
  const user = [
    `Thread with ${counterpartName}:`,
    renderThread(ctx.thread),
    '',
    'Draft my reply now.',
  ].join('\n');

  return { system, user, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
}

/**
 * Parse + validate the model's response, applying the honesty guard.
 * @param {string|{content?:string}} raw  llmGateway.complete returns { content }
 * @param {{memories?:Array, directives?:Array}} [ctx]
 * @returns {{ ok:boolean, draft:string|null, why:Array<{kind:string,note:string}>, error?:string }}
 */
export function parseDraftResponse(raw, ctx = {}) {
  const text = typeof raw === 'string'
    ? raw
    : (raw && typeof raw.content === 'string' ? raw.content : '');

  let obj;
  try {
    obj = JSON.parse(extractJson(text));
  } catch {
    return { ok: false, error: 'unparseable', draft: null, why: [] };
  }

  const draft = typeof obj?.draft === 'string' ? obj.draft.trim() : '';
  if (!draft) return { ok: false, error: 'empty_draft', draft: null, why: [] };

  const hasMemories = Array.isArray(ctx.memories) && ctx.memories.length > 0;
  const hasDirectives = Array.isArray(ctx.directives) && ctx.directives.length > 0;

  const why = [];
  for (const w of Array.isArray(obj.why) ? obj.why : []) {
    if (why.length >= MAX_WHY) break;
    const kind = typeof w?.kind === 'string' ? w.kind.toLowerCase() : '';
    const note = typeof w?.note === 'string'
      ? w.note.trim()
      : (typeof w === 'string' ? w.trim() : '');
    if (!note || !WHY_KINDS.has(kind)) continue;
    if (kind === 'memory' && !hasMemories) continue;       // honesty guard
    if (kind === 'directive' && !hasDirectives) continue;  // honesty guard
    why.push({ kind, note: note.slice(0, MAX_NOTE) });
  }

  return { ok: true, draft, why };
}

// ── helpers ────────────────────────────────────────────────────────────────

function num(v) {
  return (v === null || v === undefined || Number.isNaN(v)) ? '?' : v;
}

function list(items, empty) {
  if (!Array.isArray(items) || items.length === 0) return empty;
  const rendered = items
    .map(i => (typeof i === 'string' ? i : i && i.content))
    .filter(Boolean)
    .map(s => `- ${s}`)
    .join('\n');
  return rendered || empty;
}

function renderThread(thread) {
  if (!thread) return '(no thread content)';
  const head = thread.subject ? `Subject: ${thread.subject}` : '';
  const msgs = (Array.isArray(thread.messages) ? thread.messages : [])
    .slice(-THREAD_TAIL)
    .map(m => `${m.author || 'them'}: ${String(m.text || '').trim()}`)
    .join('\n');
  return [head, msgs].filter(Boolean).join('\n') || '(no thread content)';
}

/** Tolerate a model that wraps JSON in ```fences``` or leading prose. */
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) return text.slice(first, last + 1);
  return text.trim();
}
