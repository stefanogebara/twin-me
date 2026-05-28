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
import { createLogger } from '../services/logger.js';

const log = createLogger('ObservationsMeeting');

const router = express.Router();

const MAX_MEETINGS_PER_BATCH = 100;
// Meetings are a bit more salient than passive activity clips (importance 4),
// so they land at 5 — moderately interesting, surfaces in retrieval more often.
const MEETING_IMPORTANCE = 5;

const MeetingSchema = z.object({
  local_id: z.number().int(),
  platform: z.string().min(1).max(64),
  title: z.string().max(512).nullish(),
  started_at: z.number().int().positive(),
  ended_at: z.number().int().positive().nullish(),
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

  for (const meeting of meetings) {
    const { local_id, platform, title, started_at, ended_at } = meeting;
    const summary = buildSummary({ platform, title, started_at, ended_at });

    try {
      const memory = await addMemory(userId, summary, 'observation', {
        source: 'desktop_meeting',
        platform,
        title: title ?? null,
        started_at,
        ended_at: ended_at ?? null,
      }, { importanceScore: MEETING_IMPORTANCE, skipImportance: true });

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
