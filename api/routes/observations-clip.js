/**
 * Observations Clip API
 * =====================
 * Ingest endpoint for the TwinMe Desktop app (Phase 3). The desktop client
 * watches the foreground app + window title the user is looking at and posts
 * batches of "clips" here. Each clip is persisted as an `observation` memory
 * in the unified memory stream so it feeds reflections, the twin summary, etc.
 *
 * Endpoint:
 *   POST /api/observations/clip — batch sync (max 100 clips)
 *
 * The response maps each clip's client-side `local_id` to the resulting
 * `memory_id` so the desktop can mark exactly the rows that landed (and retry
 * the dropped ones). Requires JWT auth; uses public.users.id per CLAUDE.md.
 */

import express from 'express';
import { z } from 'zod';
import { authenticateUser } from '../middleware/auth.js';
import { addMemory } from '../services/memoryStreamService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('ObservationsClip');

const router = express.Router();

const MAX_CONTENT_CHARS = 8000;
// Hard schema ceiling: clips over MAX_CONTENT_CHARS are accepted by the schema
// but soft-dropped per-clip with reason 'content_too_long' (so one oversized
// clip doesn't 400 the whole batch). This ceiling only guards against absurd
// payloads abusing the endpoint.
const HARD_CONTENT_CEILING = 200_000;
// Window titles are captured raw from the OS (Windows GetWindowTextW is
// uncapped); long browser/doc titles routinely exceed this. We TRUNCATE to the
// cap rather than reject, so a long title never costs us the observation.
const MAX_WINDOW_TITLE_CHARS = 512;
const SUMMARY_MAX_CHARS = 4000;
const MAX_CLIPS_PER_BATCH = 100;
const CLIP_IMPORTANCE = 4;

const ClipSchema = z.object({
  local_id: z.number().int(),
  app_name: z.string().min(1).max(128),
  window_title: z.string().max(MAX_WINDOW_TITLE_CHARS).optional(),
  content: z.string().max(HARD_CONTENT_CEILING).optional(),
  started_at: z.number().int().positive(),
  ended_at: z.number().int().positive().optional(),
});

// Outer shape only — clips must be a bounded array. Each clip is validated
// INDIVIDUALLY in the handler (NOT via z.array(ClipSchema)) so one malformed
// clip is dropped on its own instead of 400-ing the whole batch. A batch-level
// 400 is left unsynced and retried forever by the desktop, so a single bad clip
// (e.g. an over-long title before we truncated) would poison the queue forever.
const BatchSchema = z.object({
  clips: z.array(z.unknown()).max(MAX_CLIPS_PER_BATCH),
});

// Truncate oversized free-text fields BEFORE per-clip validation so a long
// window title or large content body is KEPT (clipped to the schema ceiling)
// rather than rejected. Returns a new object — never mutates the request data.
function coerceClipFields(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const next = { ...raw };
  if (typeof next.window_title === 'string' && next.window_title.length > MAX_WINDOW_TITLE_CHARS) {
    next.window_title = next.window_title.slice(0, MAX_WINDOW_TITLE_CHARS);
  }
  if (typeof next.content === 'string' && next.content.length > HARD_CONTENT_CEILING) {
    next.content = next.content.slice(0, HARD_CONTENT_CEILING);
  }
  return next;
}

// ====================================================================
// POST /clip — batch-ingest desktop activity clips
// ====================================================================
router.post('/clip', authenticateUser, async (req, res) => {
  const parsed = BatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'invalid_payload',
      details: parsed.error.flatten(),
    });
  }

  const userId = req.user.id;
  const { clips } = parsed.data;

  const synced = [];
  const dropped = [];

  for (const rawClip of clips) {
    // Validate each clip on its own (after truncating oversized fields) so a
    // single malformed clip is dropped individually rather than failing — and
    // then endlessly retrying — the entire batch.
    const clipParse = ClipSchema.safeParse(coerceClipFields(rawClip));
    if (!clipParse.success) {
      const localId = rawClip && typeof rawClip.local_id === 'number' ? rawClip.local_id : -1;
      dropped.push({ local_id: localId, reason: 'invalid_clip' });
      continue;
    }
    const { local_id, app_name, window_title, content, started_at, ended_at } = clipParse.data;

    // Oversized content: zod already caps content at MAX_CONTENT_CHARS, but
    // defence-in-depth — drop explicitly rather than silently truncating, so
    // the desktop knows to split or discard the clip.
    if (content && content.length > MAX_CONTENT_CHARS) {
      dropped.push({ local_id, reason: 'content_too_long' });
      continue;
    }

    const trimmed = content ? content.trim() : '';
    const summary = trimmed.length > 0
      ? trimmed.slice(0, SUMMARY_MAX_CHARS)
      : `Opened ${app_name}${window_title ? ` — ${window_title}` : ''}`;

    try {
      const memory = await addMemory(userId, summary, 'observation', {
        source: 'desktop_clip',
        app: app_name,
        window: window_title ?? null,
        started_at,
        ended_at: ended_at ?? null,
      }, { importanceScore: CLIP_IMPORTANCE, skipImportance: true });

      if (memory && memory.id) {
        synced.push({ local_id, memory_id: memory.id });
      } else {
        dropped.push({ local_id, reason: 'insert_failed' });
      }
    } catch (error) {
      log.warn('Clip insert failed', { local_id, error: error?.message });
      dropped.push({ local_id, reason: 'insert_failed' });
    }
  }

  log.info('Clip batch processed', { userId, received: clips.length, synced: synced.length, dropped: dropped.length });
  // Note: addMemory dedups exact content within 24h, so two identical clips in
  // one batch (or across desktop retries) map to the SAME memory_id — making
  // retries idempotent. Envelope includes `success: true` to match the repo's
  // standard API response shape (sibling routes use { success, ... }).
  res.json({ success: true, synced, dropped });
});

export default router;
