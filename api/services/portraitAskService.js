/**
 * Ask, on the Portrait
 * ====================
 * Answers a question as the person, from their readings only, and returns the ids of
 * the readings the answer rests on. No uncited sentence: when nothing supports an
 * answer, the twin says it does not know that yet and names the source that would help.
 *
 * Deliberately separate from the streamed twin chat (api/routes/twin-chat.js): one
 * non-streaming call on the chat tier, a strict JSON contract, a daily cap per person.
 * Spec: .claude/plans/2026-09-03-portrait/README.md (Ask).
 */

import { complete as llmComplete, TIER_CHAT } from './llmGateway.js';
import { get as redisGet, set as redisSet } from './redisClient.js';
import { loadPortrait, SOURCE_LABEL } from './portraitService.js';
import { createLogger } from './logger.js';

const log = createLogger('PortraitAsk');

export const DAILY_CAP = 40;
const MAX_READINGS_IN_PROMPT = 40;
const MAX_QUESTION_CHARS = 400;

const ALL_SOURCES = ['spotify', 'google_calendar', 'youtube', 'google_gmail', 'discord', 'github', 'whoop'];

/** The line for when nothing supports an answer, naming a source that would help. */
export function notYetLine(sources = []) {
  const connected = new Set(sources.map((s) => s.platform));
  const missing = ALL_SOURCES.find((p) => !connected.has(p));
  const help = missing ? ` Connecting ${SOURCE_LABEL[missing] || missing} would help.` : ' Give it a few more days of reading.';
  return `I do not know that about myself yet. Nothing I have read supports an answer.${help}`;
}

export function buildAskPrompt({ owner, readings, question }) {
  const list = readings.slice(0, MAX_READINGS_IN_PROMPT)
    .map((r) => `[${r.id}] ${r.text} (${r.evidence.length} events from ${[...new Set(r.evidence.map((e) => e.source))].join(', ')})`)
    .join('\n');
  const system = `You are ${owner}'s twin. You answer as ${owner}, in the first person, in plain everyday words, in at most three sentences.
You may only say things that rest on the readings below. Every sentence must be supported by at least one reading.
If the readings do not support an answer, do not guess: return an empty "cites" list and leave "answer" empty.
Return ONLY JSON: {"answer": "...", "cites": ["<reading id>", ...]}. No emojis.

READINGS
${list || '(none)'}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: question.slice(0, MAX_QUESTION_CHARS) },
  ];
}

/** Extracts the JSON contract from the model's text; keeps only ids that exist. */
export function parseAskReply(text, validIds) {
  const valid = new Set(validIds);
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let parsed;
  try { parsed = JSON.parse(m[0]); } catch { return null; }
  const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : '';
  const cites = Array.isArray(parsed.cites) ? parsed.cites.filter((id) => typeof id === 'string' && valid.has(id)) : [];
  if (!answer || cites.length === 0) return null;
  return { a: answer, cites: [...new Set(cites)] };
}

/**
 * Answers from a Portrait already in hand. `complete` is injectable for tests.
 */
export async function answerFromPortrait(portrait, question, { complete = llmComplete, userId } = {}) {
  const readings = (portrait.readings || []).filter((r) => r.verdict !== 'wrong');
  if (readings.length === 0) return { a: notYetLine(portrait.sources), cites: [] };
  const result = await complete({
    tier: TIER_CHAT,
    messages: buildAskPrompt({ owner: portrait.owner, readings, question }),
    maxTokens: 300,
    temperature: 0.5,
    userId,
    serviceName: 'portrait-ask',
  });
  const parsed = parseAskReply(result?.content, readings.map((r) => r.id));
  return parsed || { a: notYetLine(portrait.sources), cites: [] };
}

function dayKey(userId) {
  return `portraitAsk:${userId}:${new Date().toISOString().slice(0, 10)}`;
}

/** Daily cap per person; counts in Redis with an in-memory fallback. */
export async function underDailyCap(userId) {
  const key = dayKey(userId);
  const used = Number((await redisGet(key)) || 0);
  if (used >= DAILY_CAP) return false;
  await redisSet(key, String(used + 1), 86_400);
  return true;
}

export async function askPortrait(userId, question) {
  const q = String(question || '').trim();
  if (!q) throw new Error('empty question');
  if (!(await underDailyCap(userId))) {
    const err = new Error('daily cap reached');
    err.code = 'CAP';
    throw err;
  }
  const portrait = await loadPortrait(userId);
  const reply = await answerFromPortrait(portrait, q, { userId });
  log.info('Portrait ask answered', { userId, cited: reply.cites.length });
  return reply;
}
