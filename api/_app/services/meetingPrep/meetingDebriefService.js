/**
 * Meeting Debrief Service — Phase 2 of the meeting-prep agent.
 *
 * After a prepped meeting ends, generate a structured reflection:
 *   - likelyCovered: bullet list inferred from pre-briefing talking points
 *   - probableActionItems: what the user likely committed to
 *   - followUpsRecommended: 2-3 concrete next steps
 *   - relationshipNotes: per-attendee things to remember for next time
 *
 * Without an audio/transcript pipeline this is necessarily speculative —
 * the LLM works from the pre-briefing + any memory-stream activity in the
 * meeting timeframe + emails sent in the 30 min after the meeting ended.
 * Framed in the UI as "your twin's read" not "what was said".
 *
 * Storage: merged into the same meeting_briefings row, under
 * briefing_json.debrief — zero migration.
 *
 * Triggered by cron-meeting-debrief (every 30 min); idempotent (skips
 * rows that already have briefing_json.debrief).
 */

import { complete, TIER_ANALYSIS, TIER_CHAT } from '../llmGateway.js';
import { retrieveMemories } from '../memoryStreamService.js';
import { supabaseAdmin } from '../database.js';
import { createLogger } from '../logger.js';

const log = createLogger('MeetingDebriefService');

/**
 * Build the LLM prompt. Same JSON-only-output discipline as the prep
 * prompt so parsing is deterministic.
 */
function buildDebriefPrompt({ event, prepBriefing, postContext }) {
  return `You are writing a post-meeting debrief for ${postContext.userName || 'the user'}.

MEETING THAT JUST ENDED
Title: ${event.summary || 'Untitled meeting'}
Time: ${event.startTime} — ${event.endTime}
Attendees: ${event.attendees.map((a) => a.name || a.email).join(', ') || 'unknown'}

WHAT THE TWIN PREPARED BEFORE (this gives you what was supposed to happen)
Headline: ${prepBriefing.headline || '(none)'}
Talking points:
${(prepBriefing.talkingPoints || []).map((tp) => `  - ${tp}`).join('\n') || '  - (none recorded)'}
Watch-outs:
${(prepBriefing.watchOuts || []).map((w) => `  - ${w}`).join('\n') || '  - (none recorded)'}
User context: ${prepBriefing.myContext || '(none)'}

POST-MEETING SIGNAL (memories + activity captured AFTER the meeting ended)
${postContext.recentMemories.length > 0
  ? postContext.recentMemories.map((m) => `  - ${m}`).join('\n')
  : '  - (no post-meeting activity captured yet)'}

You do NOT have a transcript. Your job is to write the most useful
"twin's read" of the meeting based on the prep + any post-meeting signal.
Be honest about uncertainty — phrase as "likely" or "probably" when
inferring, not as if you witnessed the conversation.

Generate a debrief as a JSON object with EXACTLY this structure:
{
  "summary": "<1-2 sentence read of what the meeting probably accomplished>",
  "likelyCovered": [
    "<topic 1 — likely from the talking points + context>",
    "<topic 2>",
    "<topic 3 if applicable>"
  ],
  "probableActionItems": [
    {"owner": "me" | "<attendee name>", "task": "<concrete action>"}
  ],
  "followUpsRecommended": [
    "<concrete next-step suggestion — what to do this week>",
    "<another suggestion>"
  ],
  "relationshipNotes": [
    {"person": "<attendee name>", "note": "<thing to remember about them for next time>"}
  ]
}

Rules:
- 2-5 items per array; skip arrays entirely (use []) if you have nothing concrete
- probableActionItems: phrase "task" as a verb-led concrete action ("Send the deck", "Follow up about pricing")
- relationshipNotes: ONE note per attendee max; only meaningful observations
- Output ONLY the JSON object, no markdown, no preamble`;
}

async function buildPostMeetingContext(userId, eventSummary, endTime) {
  const userInfo = await supabaseAdmin
    .from('users')
    .select('first_name, name')
    .eq('id', userId)
    .single();

  // Memories ingested AFTER the meeting ended (catches notes the user
  // wrote in chat, emails they sent, calendar events they created, etc.)
  const memories = await retrieveMemories(
    userId,
    `meeting ${eventSummary} aftermath follow-up`,
    8,
    { weights: [1.0, 0.5, 0.7] }, // recent-biased
  ).catch(() => []);

  const endTs = new Date(endTime).getTime();
  const postOnly = memories.filter((m) => {
    const created = new Date(m.created_at || m.last_accessed_at || 0).getTime();
    return created >= endTs;
  });

  return {
    userName: userInfo?.data?.first_name || userInfo?.data?.name || null,
    recentMemories: postOnly.map((m) => m.content).slice(0, 8),
  };
}

/**
 * Generate + persist a debrief for one row of meeting_briefings.
 * Idempotent: if briefing_json.debrief already present, returns null.
 */
export async function generateDebrief(userId, briefingRow) {
  const briefingJson = briefingRow.briefing_json || {};
  if (briefingJson.debrief) {
    log.debug('Debrief already exists', { eventId: briefingRow.event_id });
    return null;
  }

  const meta = briefingJson._meta || {};
  if (!meta.endTime) {
    log.warn('Missing _meta.endTime — cannot debrief', { eventId: briefingRow.event_id });
    return null;
  }

  const eventForPrompt = {
    summary: meta.summary || briefingJson.headline || 'meeting',
    startTime: meta.startTime || meta.endTime,
    endTime: meta.endTime,
    attendees: Array.isArray(meta.attendees) ? meta.attendees : [],
  };

  const postContext = await buildPostMeetingContext(userId, eventForPrompt.summary, meta.endTime);

  const prompt = buildDebriefPrompt({
    event: eventForPrompt,
    prepBriefing: briefingJson,
    postContext,
  });

  let result;
  try {
    result = await complete({
      tier: TIER_ANALYSIS,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 900,
      temperature: 0.3,
    });
  } catch (err) {
    log.warn('TIER_ANALYSIS failed for debrief, falling back to TIER_CHAT', { error: err.message });
    result = await complete({
      tier: TIER_CHAT,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 900,
      temperature: 0.3,
    });
  }

  const text = result.content?.trim() || '';
  const jsonMatch = text.match(/\{[\s\S]+\}/);
  if (!jsonMatch) {
    log.warn('LLM returned no JSON for debrief', { eventId: briefingRow.event_id });
    return null;
  }

  let debrief;
  try {
    debrief = JSON.parse(jsonMatch[0]);
  } catch (err) {
    log.warn('Debrief JSON parse failed', { error: err.message });
    return null;
  }

  // Merge debrief into briefing_json under .debrief — preserves prep payload.
  const updated = {
    ...briefingJson,
    debrief: {
      ...debrief,
      generatedAt: new Date().toISOString(),
    },
  };

  const { error } = await supabaseAdmin
    .from('meeting_briefings')
    .update({ briefing_json: updated })
    .eq('id', briefingRow.id);

  if (error) {
    log.error('Failed to store debrief', { eventId: briefingRow.event_id, error: error.message });
    return null;
  }

  log.info('Generated meeting debrief', { eventId: briefingRow.event_id });
  return debrief;
}

/**
 * Generate a recap email (subject + plain-text body) from a meeting's
 * debrief. Phase 3: the twin doesn't just observe — it drafts the
 * follow-up email for the user, who reviews + sends.
 *
 * Returns { subject, body, to } where `to` is the first external
 * attendee. Throws if the briefing has no debrief yet.
 */
export async function generateRecapEmail(userId, briefingRow) {
  const briefingJson = briefingRow.briefing_json || {};
  const debrief = briefingJson.debrief;
  if (!debrief) {
    throw new Error('no debrief yet — recap needs a post-meeting debrief first');
  }

  const meta = briefingJson._meta || {};
  const attendees = Array.isArray(meta.attendees) ? meta.attendees : [];
  // Recipient: first non-organizer attendee with an email. Organizer is
  // usually the user themselves.
  const recipient = attendees.find((a) => a.email && !a.organizer) || attendees.find((a) => a.email);
  const to = recipient?.email || null;
  const recipientName = recipient?.name || (to ? to.split('@')[0] : 'there');

  const userInfo = await supabaseAdmin
    .from('users')
    .select('first_name, name')
    .eq('id', userId)
    .single();
  const senderName = userInfo?.data?.first_name || userInfo?.data?.name || '';

  const meetingTitle = meta.summary || briefingJson.headline || 'our meeting';

  const prompt = `Write a concise, warm post-meeting recap email.

MEETING: ${meetingTitle}
RECIPIENT: ${recipientName}
SENDER: ${senderName || '(the user)'}

DEBRIEF (the twin's read of what happened):
Summary: ${debrief.summary || '(none)'}
Likely covered: ${(debrief.likelyCovered || []).join('; ') || '(none)'}
Action items: ${(debrief.probableActionItems || []).map((ai) => `[${ai.owner}] ${ai.task}`).join('; ') || '(none)'}
Recommended follow-ups: ${(debrief.followUpsRecommended || []).join('; ') || '(none)'}

Write the email as JSON with EXACTLY this structure:
{
  "subject": "<short subject line, e.g. 'Recap: <meeting topic>'>",
  "body": "<plain-text email body>"
}

Rules for the body:
- Open with a brief, warm greeting to ${recipientName}
- 1-2 sentence recap of what was discussed
- A short bulleted list of action items (use "- " bullets), each tagged with who owns it
- Close with a forward-looking line and a sign-off from ${senderName || 'the sender'}
- Keep it under 150 words — recap emails should be skimmable
- Plain text only, no markdown headers, no preamble
- Do NOT invent specifics that aren't in the debrief — keep it honest and slightly tentative where the debrief is tentative
Output ONLY the JSON object.`;

  let result;
  try {
    result = await complete({
      tier: TIER_ANALYSIS,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 600,
      temperature: 0.4,
    });
  } catch (err) {
    log.warn('TIER_ANALYSIS failed for recap, falling back to TIER_CHAT', { error: err.message });
    result = await complete({
      tier: TIER_CHAT,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 600,
      temperature: 0.4,
    });
  }

  const text = result.content?.trim() || '';
  const jsonMatch = text.match(/\{[\s\S]+\}/);
  if (!jsonMatch) throw new Error('LLM returned no JSON for recap email');

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    subject: parsed.subject || `Recap: ${meetingTitle}`,
    body: parsed.body || debrief.summary || '',
    to,
    recipientName,
  };
}

/**
 * Find prep'd meetings that ended 30-180 min ago and don't have a debrief
 * yet. Window is forgiving (180 min) so a missed cron run still picks
 * the meeting up next time.
 */
export async function findDebriefCandidates(userId) {
  const now = Date.now();

  // Audit 2026-05-22: previously gated on `generated_at >= now - 180m`.
  // Briefings are generated BEFORE the meeting (often hours or days in
  // advance via the prep cron). Filtering on generated_at threw away
  // every candidate whose briefing was generated >180m ago — almost
  // all of them. Cron reported "0 debriefs generated" every 30 min run
  // for weeks. Stefano's Murilo Personal meeting (ended 2026-05-21
  // 18:00 UTC) fired the cron at 18:30, 19:00, 19:30, 20:00 — all
  // returned 0 because the briefing was generated the day before.
  //
  // Fix: SQL window scoped to briefings generated in the last 14 days
  // (broad enough to catch any meeting that could still be in the
  // debrief window). The in-memory _meta.endTime filter then picks
  // the actual eligible candidates. limit(100) keeps the working set
  // bounded for power users.
  const sqlEarliestBriefingGen = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('meeting_briefings')
    .select('id, event_id, briefing_json, user_id')
    .eq('user_id', userId)
    .gte('generated_at', sqlEarliestBriefingGen)
    .limit(100);

  if (error || !data) return [];

  return data.filter((row) => {
    const meta = row.briefing_json?._meta;
    if (!meta?.endTime) return false;
    const endTs = new Date(meta.endTime).getTime();
    if (!Number.isFinite(endTs)) return false;
    // Meeting ended at least 25 min ago, at most 180 min ago.
    return endTs <= now - 25 * 60 * 1000 && endTs >= now - 180 * 60 * 1000
      && !row.briefing_json?.debrief;
  });
}
