/**
 * Desktop onboarding "Here's what I noticed" summary.
 * ===================================================
 * POST /api/desktop/observe-summary
 *
 * Turns the desktop app's locally-captured activity — application name + window
 * title ONLY, never screen contents — into a short, first-person "here's what I
 * noticed" summary plus one forward-looking insight, for the onboarding
 * live-observe screen (Littlebird's step-9 "picked up" moment).
 *
 * Unauthenticated by design: the request body is the ONLY input, it carries no
 * account data, and nothing is read from or written to the database. The desktop
 * app already holds this exact list locally (via its `demo_get_clips` command);
 * this endpoint merely narrates it. Protected by the global API rate limiter.
 *
 * Honesty constraint (baked into the prompt): we have app names + window titles,
 * not screen content, so the model is told never to invent specifics that are
 * not literally present in a title, and never to imply it read the screen.
 */
import express from 'express';
import { complete, TIER_ANALYSIS } from '../services/llmGateway.js';

const router = express.Router();

const MAX_CLIPS = 40;
const MAX_APP_LEN = 120;
const MAX_TITLE_LEN = 200;
const MAX_NAME_LEN = 60;

/**
 * Validate + normalize the client-supplied clip list. Returns null when the
 * input is not an array at all (→ 400 "must be an array"), or an array of
 * { app, title } with empty-app entries removed and lengths clamped.
 */
function sanitizeClips(raw) {
  if (!Array.isArray(raw)) return null;
  const clips = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const app = typeof c.app === 'string' ? c.app.trim().slice(0, MAX_APP_LEN) : '';
    if (!app) continue;
    const title = typeof c.title === 'string' ? c.title.trim().slice(0, MAX_TITLE_LEN) : '';
    clips.push({ app, title });
    if (clips.length >= MAX_CLIPS) break;
  }
  return clips;
}

/**
 * Extract { summary, insight } from the model output. Tolerates ```json fences
 * and surrounding prose. Returns null when no usable summary can be recovered.
 */
function parseSummaryJson(content) {
  if (typeof content !== 'string') return null;
  let text = content.trim();

  // Strip a ```json ... ``` (or plain ``` ... ```) fence if present.
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1].trim();

  // If there's leading/trailing prose, isolate the first {...} block.
  if (!text.startsWith('{')) {
    const brace = text.match(/\{[\s\S]*\}/);
    if (brace) text = brace[0];
  }

  try {
    const obj = JSON.parse(text);
    const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
    const insight = typeof obj.insight === 'string' ? obj.insight.trim() : '';
    if (!summary) return null;
    return { summary, insight };
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = [
  'You are the user\'s personal AI twin, speaking in the first person ("I noticed...").',
  'You are given a list of desktop apps and window titles the user just had open.',
  'This is the ONLY information available to you: application names and window titles.',
  'You CANNOT see screen contents, message bodies, or anything not present in a title.',
  'Write a warm, concise observation of what they seem to be doing, grounded ONLY in those apps and titles.',
  'Never invent specifics (people, companies, content) that are not literally present in a window title.',
  'Never imply you read the screen — you only saw which apps and windows were open.',
  'No emojis. No markdown. Address the user by their first name if one is provided.',
  'Respond with STRICT JSON ONLY (no prose, no code fences) in exactly this shape:',
  '{"summary": "<two short sentences describing what they were doing>", "insight": "<one sentence on what you could help with next>"}',
].join('\n');

router.post('/observe-summary', async (req, res) => {
  const clips = sanitizeClips(req.body?.clips);
  if (clips === null) {
    return res.status(400).json({ success: false, error: 'clips must be an array' });
  }
  if (clips.length === 0) {
    return res.status(400).json({ success: false, error: 'No clips with a usable app name' });
  }

  const name =
    typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, MAX_NAME_LEN) : '';

  const lines = clips
    .map((c) => (c.title ? `- ${c.app} — ${c.title}` : `- ${c.app}`))
    .join('\n');
  const userMessage = [
    name ? `The user's name is ${name}.` : null,
    'Apps and window titles (most recent first):',
    lines,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const result = await complete({
      tier: TIER_ANALYSIS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 400,
      temperature: 0.6,
      serviceName: 'desktop-observe-summary',
    });

    const parsed = parseSummaryJson(result?.content);
    if (!parsed) {
      console.error('[desktop-observe-summary] could not parse model output');
      return res.status(502).json({ success: false, error: 'Could not generate a summary' });
    }

    return res.json({ success: true, summary: parsed.summary, insight: parsed.insight });
  } catch (err) {
    console.error('[desktop-observe-summary] LLM error:', err.message);
    return res.status(502).json({ success: false, error: 'Summary service unavailable' });
  }
});

export default router;
