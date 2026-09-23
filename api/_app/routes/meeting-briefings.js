/**
 * Meeting Briefings — read endpoint.
 *
 * Surfaces the briefings the meeting-prep cron + on-demand chat tool have
 * already generated into a first-class API. Used by the /meetings page in
 * the frontend.
 *
 *   GET /api/meeting-briefings
 *     Returns:
 *       {
 *         success: true,
 *         inProgress: [Briefing],  // started, not yet ended — happening right now
 *         upcoming:   [Briefing],  // start in the future (next 14d), sorted ascending
 *         recent:     [Briefing],  // already ended (last 14d), sorted descending
 *         undated:    [Briefing],  // legacy rows with no schedule info
 *       }
 *
 *     Briefing shape:
 *       {
 *         id, eventId, generatedAt, headline,
 *         summary, startTime, endTime, location, meetingUrl,  // from briefing_json._meta
 *         attendees: [{email, name, responseStatus, organizer}],
 *         hasDebrief: boolean,        // a post-meeting debrief has been generated
 *         debriefPending: boolean,    // ended recently, debrief expected soon (recent only)
 *         briefing: { headline, attendees, companyContext, talkingPoints, watchOuts, myContext, debrief? }
 *       }
 *
 * Old briefings without _meta have null/empty time fields — the FE renders
 * them in a "no schedule info" group instead of the upcoming/recent split.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { generateRecapEmail } from '../services/meetingPrep/meetingDebriefService.js';
import { generateBriefing, fetchUpcomingExternalEvents } from '../services/meetingPrep/meetingPrepService.js';
import { draftEmail } from '../services/googleWorkspaceActions.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('meeting-briefings');
const router = express.Router();

router.use(authenticateUser);

const WINDOW_DAYS = 14;

// A meeting that ended within this window but has no debrief yet is treated
// as "debrief pending" — the cron-meeting-debrief job runs every 30 min and
// picks up meetings that ended 25-180 min ago. Surfacing the pending state
// closes the gap where the user would otherwise see a stale prep card with
// no signal that a debrief is on the way.
const DEBRIEF_PENDING_WINDOW_MIN = 180;

/**
 * Transform a meeting_briefings row into the FE-friendly shape. Tolerates
 * the legacy schema (no _meta) so we don't lose old data.
 */
function shapeRow(row) {
  const briefing = row.briefing_json || {};
  const meta = briefing._meta || {};
  // Strip _meta from the briefing payload — it's surfaced separately.
  const { _meta, ...briefingClean } = briefing;
  return {
    id: row.id,
    eventId: row.event_id,
    generatedAt: row.generated_at,
    headline: row.headline,
    summary: meta.summary || null,
    startTime: meta.startTime || null,
    endTime: meta.endTime || null,
    location: meta.location || null,
    hangoutLink: meta.hangoutLink || null,
    meetingUrl: meta.meetingUrl || null,
    attendees: Array.isArray(meta.attendees) ? meta.attendees : [],
    hasDebrief: !!briefing.debrief,
    debriefPending: false, // set by the GET handler for recent rows
    briefing: briefingClean,
  };
}

router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    const now = new Date();
    const windowStart = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const windowEnd = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('meeting_briefings')
      .select('id, event_id, generated_at, headline, briefing_json')
      .eq('user_id', userId)
      .gte('generated_at', windowStart)
      .order('generated_at', { ascending: false })
      .limit(50);

    if (error) {
      log.error('query failed', { error: error.message });
      return res.status(500).json({ success: false, error: 'failed to fetch briefings' });
    }

    const shaped = (data || []).map(shapeRow);

    const nowMs = now.getTime();
    const inProgress = [];
    const upcoming = [];
    const recent = [];
    const undated = [];

    for (const row of shaped) {
      if (!row.startTime) {
        undated.push(row);
        continue;
      }
      const startMs = new Date(row.startTime).getTime();
      // endTime can be missing on legacy rows — fall back to a 60-min default
      // so an in-progress meeting isn't misclassified the moment it starts.
      const endMs = row.endTime
        ? new Date(row.endTime).getTime()
        : startMs + 60 * 60 * 1000;

      if (startMs <= nowMs && nowMs < endMs) {
        inProgress.push(row);
      } else if (startMs > nowMs) {
        // Tolerate windowEnd overrun — show whatever was generated even if it's
        // for a meeting beyond the typical 14-day window.
        upcoming.push(row);
      } else {
        // Already ended. Flag the debrief-pending gap: ended within the last
        // 3h with no debrief yet — the debrief cron will pick it up shortly.
        const endedMinAgo = (nowMs - endMs) / 60000;
        if (!row.hasDebrief && endedMinAgo >= 0 && endedMinAgo <= DEBRIEF_PENDING_WINDOW_MIN) {
          row.debriefPending = true;
        }
        recent.push(row);
      }
    }

    inProgress.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    upcoming.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    recent.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    res.json({
      success: true,
      inProgress,
      upcoming,
      recent,
      undated,
      windowDays: WINDOW_DAYS,
    });
  } catch (err) {
    log.error(`unhandled: ${err.message}`);
    res.status(500).json({ success: false, error: 'failed to fetch briefings' });
  }
});

// Each briefing is a multi-call LLM pipeline (~20-25s wall time). The scan
// runs them synchronously so the FE can reload with fresh data, which means
// the request duration scales linearly with the meeting count. Cap it so a
// packed calendar can't blow past the platform's HTTP timeout — events past
// the cap are left for the cron-meeting-prep job (runs every 30 min) or a
// follow-up scan. Events are ordered by start time, so the cap always briefs
// the soonest meetings first.
const MAX_SCAN_BRIEFINGS = 8;

/**
 * POST /scan
 *
 * On-demand calendar scan + brief. Triggers the same logic the
 * cron-meeting-prep cron runs, but for the calling user RIGHT NOW —
 * so they don't have to wait up to 30 min for the next cron tick.
 *
 * Powers the "Atualizar" button on the /meetings page. Idempotent:
 * generateBriefing skips events already briefed at the same etag, so
 * spamming the button is cheap.
 *
 * Caps work at MAX_SCAN_BRIEFINGS to stay under the HTTP timeout —
 * deferred meetings are reported back so the FE can tell the user.
 *
 * Returns: { success, scanned, briefingsGenerated, deferred }
 */
router.post('/scan', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    let events;
    try {
      events = await fetchUpcomingExternalEvents(userId);
    } catch (scanErr) {
      log.error('scan: calendar fetch failed', { error: scanErr.message });
      return res.status(502).json({
        success: false,
        error: 'could not read your calendar — is Google Calendar connected?',
        code: 'CALENDAR_FETCH_FAILED',
      });
    }

    // fetchUpcomingExternalEvents already returns events ordered by start
    // time, so slicing keeps the soonest meetings.
    const toBrief = events.slice(0, MAX_SCAN_BRIEFINGS);
    const deferred = Math.max(0, events.length - toBrief.length);

    let briefingsGenerated = 0;
    for (const event of toBrief) {
      try {
        const result = await generateBriefing(userId, event);
        if (result) briefingsGenerated++;
      } catch (briefErr) {
        log.warn('scan: briefing failed for event', { eventId: event.id, error: briefErr.message });
      }
    }

    log.info('on-demand scan complete', {
      userId, scanned: events.length, briefingsGenerated, deferred,
    });
    return res.json({
      success: true,
      scanned: events.length,
      briefingsGenerated,
      deferred,
    });
  } catch (err) {
    log.error(`scan unhandled: ${err.message}`);
    res.status(500).json({ success: false, error: 'scan failed' });
  }
});

/**
 * POST /:id/recap
 *
 * Phase 3 agentic action: the twin drafts a post-meeting recap email
 * from the debrief and saves it as a Gmail draft. It does NOT send —
 * the user reviews + sends from Gmail. (Renan's framing: twin does the
 * work, user keeps control of the irreversible step.)
 *
 * Requires: the briefing row has a debrief (run cron-meeting-debrief
 * first) and the user has Gmail connected.
 *
 * Returns: { success, subject, body, to, draftId, gmailUrl }
 */
router.post('/:id/recap', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'unauthorized' });

    const { id } = req.params;

    const { data: row, error } = await supabaseAdmin
      .from('meeting_briefings')
      .select('id, user_id, event_id, briefing_json')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      log.error('recap: row fetch failed', { error: error.message });
      return res.status(500).json({ success: false, error: 'failed to load briefing' });
    }
    if (!row) {
      return res.status(404).json({ success: false, error: 'briefing not found' });
    }
    if (!row.briefing_json?.debrief) {
      return res.status(400).json({
        success: false,
        error: 'no debrief yet — the recap is generated from the post-meeting debrief',
        code: 'NO_DEBRIEF',
      });
    }

    // 1. LLM drafts the recap email from the debrief
    let recap;
    try {
      recap = await generateRecapEmail(userId, row);
    } catch (genErr) {
      log.error('recap: generation failed', { error: genErr.message });
      return res.status(500).json({ success: false, error: 'failed to draft recap' });
    }

    if (!recap.to) {
      // No external attendee email on the briefing — return the draft text
      // so the FE can still show it, but skip the Gmail draft creation.
      return res.json({
        success: true,
        subject: recap.subject,
        body: recap.body,
        to: null,
        draftId: null,
        gmailUrl: null,
        note: 'No attendee email found — copy the draft manually.',
      });
    }

    // 2. Create a Gmail DRAFT (never send — user reviews + sends)
    const draftResult = await draftEmail(userId, {
      to: recap.to,
      subject: recap.subject,
      body: recap.body,
    });

    if (!draftResult?.success) {
      // Gmail not connected, token expired, etc. — still return the text so
      // the user can copy it manually. Partial success, not a hard failure.
      return res.json({
        success: true,
        subject: recap.subject,
        body: recap.body,
        to: recap.to,
        draftId: null,
        gmailUrl: null,
        note: draftResult?.error
          ? `Couldn't save to Gmail (${draftResult.error}) — copy the draft manually.`
          : 'Gmail draft could not be created — copy the draft manually.',
      });
    }

    return res.json({
      success: true,
      subject: recap.subject,
      body: recap.body,
      to: recap.to,
      draftId: draftResult.draftId,
      // Deep link to the Gmail drafts folder — Gmail has no per-draft URL
      // that reliably opens the compose window, so /#drafts is the safe target.
      gmailUrl: 'https://mail.google.com/mail/u/0/#drafts',
    });
  } catch (err) {
    log.error(`recap unhandled: ${err.message}`);
    res.status(500).json({ success: false, error: 'failed to create recap' });
  }
});

export default router;
