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
 *         upcoming: [Briefing],   // start in the future (next 14d), sorted ascending
 *         recent:   [Briefing],   // start in the past (last 14d), sorted descending
 *       }
 *
 *     Briefing shape:
 *       {
 *         id, eventId, generatedAt, headline,
 *         summary, startTime, endTime, location, meetingUrl,  // from briefing_json._meta
 *         attendees: [{email, name, responseStatus, organizer}],
 *         briefing: { headline, attendees, companyContext, talkingPoints, watchOuts, myContext }
 *       }
 *
 * Old briefings without _meta have null/empty time fields — the FE renders
 * them in a "no schedule info" group instead of the upcoming/recent split.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { generateRecapEmail } from '../services/meetingPrep/meetingDebriefService.js';
import { draftEmail } from '../services/googleWorkspaceActions.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('meeting-briefings');
const router = express.Router();

router.use(authenticateUser);

const WINDOW_DAYS = 14;

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

    const upcoming = [];
    const recent = [];
    const undated = [];

    for (const row of shaped) {
      if (!row.startTime) {
        undated.push(row);
        continue;
      }
      // Tolerate windowEnd overrun — show whatever was generated even if it's
      // for a meeting beyond the typical 14-day window.
      if (new Date(row.startTime) >= now) {
        upcoming.push(row);
      } else {
        recent.push(row);
      }
    }

    upcoming.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    recent.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    res.json({
      success: true,
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
