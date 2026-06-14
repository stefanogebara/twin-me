/**
 * The Editor — salience + voice layer (replan-2026-06-13)
 * =========================================================
 * Sits between insight GENERATION and STORAGE. The generator may propose
 * several candidates; the Editor decides whether ANY of them is worth saying,
 * and if so rewrites the single best one in the twin's voice. Output is 0 or 1
 * insight, never a pile.
 *
 * Why this exists: the twin yapped. It shipped the same email-backlog nag six
 * times and wrote stat+stat+chore paragraphs ("...39,437 unread... archive
 * everything tonight"). String dedup and a hallucination guard didn't fix it
 * because neither asks the two questions that matter:
 *   1. Is this worth saying at all?  (salience)
 *   2. Would a person say it like this?  (voice)
 *
 * Two stages:
 *   1. Semantic dedup (free, deterministic) — embed each candidate, drop any
 *      that means the same thing as something surfaced in the last 45 days.
 *      This is what actually kills the six identical nags: they are one vector.
 *   2. The Editor (one cheap LLM pass) — pick the single most worth-saying
 *      survivor IF it clears the salience bar, rewrite it in voice, or return
 *      nothing. A deterministic voice linter is the safety net after.
 *
 * Principle: the twin may NOTICE and SAY; it may not nag. One thing, rarely,
 * like someone who knows you. Silence is the default, not the failure.
 */
import { complete, TIER_EXTRACTION } from './llmGateway.js';
import { generateEmbedding, generateEmbeddings } from './embeddingService.js';
import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('InsightEditor');

export const DEDUP_COSINE = 0.82;          // candidate >= this vs a past insight => same thing, drop
export const DEDUP_LOOKBACK_DAYS = 45;     // dedup window (anchored on surfaced_at)
export const RECENTLY_SAID_N = 10;         // how many recent insight texts the Editor sees as "already said"
const SURFACED_FETCH_LIMIT = 60;
const MIN_INSIGHT_LEN = 12;

// ── Voice linter (deterministic safety net + test oracle) ───────────────────
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/u;
// Imperative chore verbs — the "do homework" tells the twin must never use.
const COMMAND_RE = /\b(archive|triage|block(?:\s+(?:off|out|\d|\dh|an?|some|two|the))|lock\s+in|carve\s+out|set\s+(?:a|an|up)\b|schedule\s+(?:a|an|some)\b|take\s+\d+\s*(?:min|minute)|clear\s+(?:the|your)\b|pick\s+one\b|protect\s+it\b|cement\s+the\b|push\s+one\b|cut\s+back\b|start\s+(?:by|with)\b|make\s+sure\s+to\b|try\s+to\b)/i;
const AGENT_SPEAK_RE = /\b(department|proposal|approve|execute|workflow)\b/i;

/** Count sentence-final punctuation groups (rough but stable). */
function sentenceCount(text) {
  const m = (text || '').match(/[.!?]+(\s|$)/g);
  return m ? m.length : (text?.trim() ? 1 : 0);
}

/**
 * Returns a reason string if the text breaks the voice, else null. Used both
 * to fail tests and to veto an LLM rewrite that still yaps.
 */
export function violatesVoice(text) {
  const t = (text || '').trim();
  if (!t) return 'empty';
  if (EMOJI_RE.test(t)) return 'emoji';
  if (sentenceCount(t) > 2) return 'too_many_sentences';
  if (COMMAND_RE.test(t)) return 'imperative_chore';
  if (AGENT_SPEAK_RE.test(t)) return 'agent_speak';
  // Big bare number used as a weapon ("39,437 unread"). Strip thousands commas first.
  if (/\b\d{4,}\b/.test(t.replace(/(\d),(\d)/g, '$1$2'))) return 'stat_weapon_bignum';
  // Two or more percentages stacked = telemetry, not feeling.
  if ((t.match(/\d+\s*%/g) || []).length >= 2) return 'stat_weapon_percent';
  return null;
}

function stripEmoji(text) {
  return (text || '').replace(new RegExp(EMOJI_RE, 'gu'), '').replace(/\s{2,}/g, ' ').trim();
}

// ── Math + pgvector helpers ─────────────────────────────────────────────────
export function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

function parseVector(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return null;
}

/** Recently-surfaced insights (text + vector) for dedup + Editor context. */
async function fetchRecentSurfaced(userId) {
  const cutoff = new Date(Date.now() - DEDUP_LOOKBACK_DAYS * 86400_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('proactive_insights')
    .select('insight, embedding, surfaced_at')
    .eq('user_id', userId)
    .gte('surfaced_at', cutoff)
    .not('embedding', 'is', null)
    .order('surfaced_at', { ascending: false })
    .limit(SURFACED_FETCH_LIMIT);
  if (error) {
    log.warn('fetchRecentSurfaced failed (treating as no history)', { error: error.message });
    return { texts: [], vectors: [] };
  }
  const rows = data || [];
  return {
    texts: rows.map(r => r.insight).filter(Boolean),
    vectors: rows.map(r => parseVector(r.embedding)).filter(Boolean),
  };
}

// ── The Editor LLM pass ─────────────────────────────────────────────────────
function buildEditorPrompt(survivors, recentlySaid) {
  const candidateBlock = survivors
    .map((c, i) => `${i + 1}. ${c.insight}`)
    .join('\n');
  const saidBlock = recentlySaid.length
    ? recentlySaid.map(t => `- ${t}`).join('\n')
    : '(nothing recently)';

  return `You are the editorial voice of a person's digital twin — the part that decides what is worth telling them, and how. You are not an assistant and not a coach. You are the quiet, perceptive part of someone who knows them well.

You are given candidate observations about them. Choose AT MOST ONE to surface — only if it genuinely clears the bar below — and rewrite it in voice. Most of the time, the honest answer is to surface nothing.

SALIENCE BAR (surface only if ALL hold):
- It is NOT something you've recently told them (see "already said" below).
- It is at least one of: genuinely surprising, emotionally resonant, or timely right now.
- It can be said as a noticing, not a task. Logistics ("clear your inbox", "you have N unread") never clear the bar.

VOICE (the rewrite must obey):
- At most 2 sentences.
- End on a feeling or an open question — NEVER a command. No "archive", "block time", "lock in", "take 5 minutes".
- No raw statistic used as a weapon. No big counts ("40k unread"), no stacked percentages. A number appears only if it carries feeling.
- Second person, warm, plain language. Like someone who has known them for years. No jargon, no "department"/agent talk, no emojis.
- Reflect, don't instruct. Name what's true; let them sit with it.

ALREADY SAID (do not repeat the meaning of these):
${saidBlock}

CANDIDATES:
${candidateBlock}

Return ONLY this JSON, nothing else:
{"surface": boolean, "insight": string or null, "urgency": "low"|"medium"|"high", "category": string or null, "reason": string}
If nothing clears the bar, return {"surface": false, "insight": null, "urgency": "low", "category": null, "reason": "<why>"}.`;
}

function parseEditorJSON(text) {
  const stripped = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(stripped); } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { return null; } }
    return null;
  }
}

/**
 * Run the salience + voice layer over grounded candidates.
 * @param {string} userId
 * @param {Array<{insight:string, urgency?:string, category?:string}>} candidates
 *   — already grounding-checked by the caller.
 * @returns {Promise<{insight, urgency, category, embedding}|null>} 0 or 1.
 */
export async function editInsights(userId, candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  // Stage 1 — semantic dedup vs history AND within the batch.
  const recent = await fetchRecentSurfaced(userId);
  const vectors = await generateEmbeddings(candidates.map(c => c.insight)).catch(() => []);

  const survivors = [];
  const keptVectors = [];
  for (let i = 0; i < candidates.length; i++) {
    const vec = parseVector(vectors?.[i]);
    if (!vec) { survivors.push(candidates[i]); continue; } // embedding failed — let the Editor judge
    const maxVsHistory = recent.vectors.reduce((mx, v) => Math.max(mx, cosineSim(vec, v)), 0);
    const maxVsBatch = keptVectors.reduce((mx, v) => Math.max(mx, cosineSim(vec, v)), 0);
    if (Math.max(maxVsHistory, maxVsBatch) >= DEDUP_COSINE) {
      log.info('candidate dropped — semantic duplicate', { userId, sim: Math.max(maxVsHistory, maxVsBatch).toFixed(3) });
      continue;
    }
    survivors.push(candidates[i]);
    keptVectors.push(vec);
  }
  if (survivors.length === 0) return null;

  // Stage 2 — the Editor: at most one, in voice, or nothing.
  let parsed;
  try {
    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [{ role: 'user', content: buildEditorPrompt(survivors, recent.texts.slice(0, RECENTLY_SAID_N)) }],
      temperature: 0.3,
      maxTokens: 220,
      userId,
      serviceName: 'insight-editor',
    });
    parsed = parseEditorJSON(result.content);
  } catch (err) {
    log.warn('Editor LLM call failed — surfacing nothing', { userId, error: err.message });
    return null;
  }

  if (!parsed || parsed.surface !== true || !parsed.insight || parsed.insight.length < MIN_INSIGHT_LEN) {
    log.info('Editor surfaced nothing', { userId, reason: parsed?.reason });
    return null;
  }

  const final = stripEmoji(parsed.insight);
  const voiceBreak = violatesVoice(final);
  if (voiceBreak) {
    // The Editor still yapped — veto rather than ship a nag. Silence beats noise.
    log.warn('Editor output vetoed by voice linter', { userId, voiceBreak, preview: final.slice(0, 100) });
    return null;
  }

  const embedding = await generateEmbedding(final).catch(() => null);
  return {
    insight: final.substring(0, 500),
    urgency: ['low', 'medium', 'high'].includes(parsed.urgency) ? parsed.urgency : 'low',
    category: parsed.category || null,
    embedding,
  };
}

// ── applyVoice — shared rewrite for summaries (no salience gate) ─────────────
/**
 * Rewrite an always-shown text (e.g. the twin summary / soul portrait) into the
 * twin's voice: plain, warm, no jargon, no commands, no telemetry. Unlike
 * editInsights this does not gate or shorten to 2 sentences — a portrait can be
 * a few sentences — it only strips the dashboard-manager tone. Falls back to the
 * original text on any failure (never blocks the summary).
 */
export async function applyVoice(text, { kind = 'summary' } = {}) {
  const input = (text || '').trim();
  if (!input) return input;
  try {
    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [{
        role: 'user',
        content: `Rewrite the following ${kind} in a warm, plain, second-person voice — like someone who has known this person for years describing them.
Rules: no jargon ("reverse-engineering", "external systems", "cognitive"), no commands, no statistics or counts, no emojis, no clinical tone. Keep it true to the content; only change the voice. Keep it to 3 sentences or fewer.
Return ONLY the rewritten text, no preamble.

${input}`,
      }],
      temperature: 0.4,
      maxTokens: 200,
      serviceName: 'insight-editor-voice',
    });
    const out = stripEmoji((result.content || '').trim());
    return out.length >= MIN_INSIGHT_LEN ? out : input;
  } catch (err) {
    log.warn('applyVoice failed — keeping original', { error: err.message });
    return input;
  }
}
