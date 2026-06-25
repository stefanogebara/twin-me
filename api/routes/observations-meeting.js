/**
 * Observations Meeting API
 * ========================
 * Ingest endpoint for the TwinMe Desktop app (Phase 5A — meeting detection).
 * The desktop client detects when a meeting app (Zoom / Google Meet / Teams)
 * is in the foreground and posts batches of completed (or in-progress) meeting
 * SESSIONS here. Each session is persisted as an `observation` memory in the
 * unified memory stream so it feeds reflections, the twin summary, etc.
 *
 * Endpoint:
 *   POST /api/observations/meeting — batch sync (max 100 meetings)
 *
 * The response maps each meeting's client-side `local_id` to the resulting
 * `memory_id` so the desktop can mark exactly the rows that landed (and retry
 * the dropped ones). Requires JWT auth; uses public.users.id per CLAUDE.md.
 */

import express from 'express';
import { z } from 'zod';
import { authenticateUser } from '../middleware/auth.js';
import { addMemory } from '../services/memoryStreamService.js';
import { complete, TIER_ANALYSIS } from '../services/llmGateway.js';
import { stripEmoji } from '../utils/stripEmoji.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('ObservationsMeeting');

const router = express.Router();

const MAX_MEETINGS_PER_BATCH = 100;
// Meetings are a bit more salient than passive activity clips (importance 4),
// so they land at 5 — moderately interesting, surfaces in retrieval more often.
const MEETING_IMPORTANCE = 5;
// A meeting that arrives WITH an on-device transcript is more valuable than a
// bare detection — bump importance so it surfaces in retrieval more often.
const MEETING_WITH_TRANSCRIPT_IMPORTANCE = 6;
// Transcript guards: skip the LLM for trivially short transcripts (whisper on a
// silent meeting returns near-empty text), cap how much we feed the summarizer
// (bounds token cost on long meetings), and hard-ceiling the stored transcript.
const MIN_TRANSCRIPT_CHARS = 40;
const TRANSCRIPT_LLM_CHAR_CAP = 12_000;
const SUMMARY_MAX_TOKENS = 220;
const MAX_TRANSCRIPT_CHARS = 100_000;

const MeetingSchema = z.object({
  local_id: z.number().int(),
  platform: z.string().min(1).max(64),
  title: z.string().max(512).nullish(),
  started_at: z.number().int().positive(),
  ended_at: z.number().int().positive().nullish(),
  // On-device Whisper transcript (Phase 5B). nullish (NOT optional): the desktop
  // serializes an absent transcript as JSON null, which .optional() rejects.
  transcript: z.string().max(MAX_TRANSCRIPT_CHARS).nullish(),
});

const BatchSchema = z.object({
  meetings: z.array(MeetingSchema).max(MAX_MEETINGS_PER_BATCH),
});

/**
 * Build a human-readable summary for a meeting session.
 * - With a valid end time: "45-min Zoom meeting — Standup"
 * - Without (or with non-positive duration): "Zoom meeting started — Standup"
 * Guards against ended_at <= started_at (clock skew / bad client data) by
 * falling back to the "started" phrasing rather than emitting "0-min".
 */
function buildSummary({ platform, title, started_at, ended_at }) {
  const titleSuffix = title ? ` — ${title}` : '';

  if (ended_at && ended_at > started_at) {
    const durationMin = Math.round((ended_at - started_at) / 60000);
    return `${durationMin}-min ${platform} meeting${titleSuffix}`;
  }

  return `${platform} meeting started${titleSuffix}`;
}

/**
 * Summarize a meeting transcript via the analysis-tier LLM. Returns a concise,
 * emoji-free plain-text summary (key topics, decisions, the user's commitments)
 * or '' on any failure so the caller falls back to the synthetic label. The
 * transcript is clipped to bound token cost on long meetings.
 */
async function summarizeTranscript({ platform, title, transcript }) {
  const clipped = transcript.slice(0, TRANSCRIPT_LLM_CHAR_CAP);
  const titlePart = title ? ` titled "${title}"` : '';
  const result = await complete({
    tier: TIER_ANALYSIS,
    system:
      'You summarize meeting transcripts for a personal AI twin. In 2-4 sentences, '
      + 'capture the key topics, any decisions reached, and any action items or '
      + 'commitments the user personally made. Be specific and factual. '
      + 'Plain text only — no markdown, no bullet points, no emojis.',
    messages: [
      { role: 'user', content: `Summarize this ${platform} meeting${titlePart}:\n\n${clipped}` },
    ],
    maxTokens: SUMMARY_MAX_TOKENS,
    temperature: 0.4,
  });
  return stripEmoji((result?.content || '').trim());
}

// ====================================================================
// POST /meeting — batch-ingest desktop meeting sessions
// ====================================================================
router.post('/meeting', authenticateUser, async (req, res) => {
  const parsed = BatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'invalid_payload',
      details: parsed.error.flatten(),
    });
  }

  const userId = req.user.id;
  const { meetings } = parsed.data;

  const synced = [];
  const dropped = [];

  // A transcript counts only when it's substantive — whisper can return empty or
  // near-empty text for a silent / no-speech meeting.
  const hasTranscript = (m) =>
    typeof m.transcript === 'string' && m.transcript.trim().length >= MIN_TRANSCRIPT_CHARS;

  // Summarize transcript-bearing meetings in PARALLEL up front, so a batch of N
  // transcripts costs one LLM round-trip of wall-time, not N. The LLM never
  // fires for transcript-less or trivially-short meetings (free early-out); a
  // failed summary yields '' and we fall back to the synthetic label below.
  const summaries = await Promise.all(
    meetings.map(async (m) => {
      if (!hasTranscript(m)) return '';
      try {
        return await summarizeTranscript({
          platform: m.platform,
          title: m.title,
          transcript: m.transcript.trim(),
        });
      } catch (error) {
        log.warn('Meeting summary failed; storing transcript without summary', {
          local_id: m.local_id,
          error: error?.message,
        });
        return '';
      }
    }),
  );

  for (let i = 0; i < meetings.length; i++) {
    const meeting = meetings[i];
    const { local_id, platform, title, started_at, ended_at } = meeting;
    const label = buildSummary({ platform, title, started_at, ended_at });
    const withTranscript = hasTranscript(meeting);
    const aiSummary = summaries[i];

    // Content is what gets embedded + surfaces in retrieval: the AI summary when
    // we have one, otherwise the synthetic "45-min Zoom meeting — Standup" label.
    // The full transcript + summary live in metadata (user chose full+summary).
    const content = aiSummary || label;
    const metadata = {
      source: 'desktop_meeting',
      platform,
      title: title ?? null,
      started_at,
      ended_at: ended_at ?? null,
      ...(withTranscript
        ? { transcript: meeting.transcript.trim(), has_transcript: true, label }
        : {}),
      ...(aiSummary ? { summary: aiSummary } : {}),
    };
    const importanceScore = withTranscript
      ? MEETING_WITH_TRANSCRIPT_IMPORTANCE
      : MEETING_IMPORTANCE;

    try {
      const memory = await addMemory(userId, content, 'observation', metadata, {
        importanceScore,
        skipImportance: true,
      });

      if (memory && memory.id) {
        synced.push({ local_id, memory_id: memory.id });
      } else {
        dropped.push({ local_id, reason: 'insert_failed' });
      }
    } catch (error) {
      log.warn('Meeting insert failed', { local_id, error: error?.message });
      dropped.push({ local_id, reason: 'insert_failed' });
    }
  }

  log.info('Meeting batch processed', { userId, received: meetings.length, synced: synced.length, dropped: dropped.length });
  // Note: addMemory dedups exact content within 24h, so two identical meeting
  // summaries (or desktop retries) map to the SAME memory_id — making retries
  // idempotent. Envelope mirrors the clip route's { success, synced, dropped }.
  res.json({ success: true, synced, dropped });
});

export default router;
