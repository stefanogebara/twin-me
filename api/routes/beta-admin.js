/**
 * Beta Admin Routes (requires authenticateUser + requireProfessor)
 * - POST /invite — create invite code + optionally send email
 * - GET /invites — list all invite codes
 * - GET /waitlist — list waitlist entries
 * - GET /feedback — list all beta feedback
 * - POST /invite-from-waitlist — convert waitlist entry to invite
 * - POST /send-nudges — send platform nudge emails to inactive users
 * - GET /nudge-candidates — preview users who would receive nudge
 *
 * Also: POST /api/beta/feedback (auth only, NOT admin) — submit feedback
 */

import { Router } from 'express';
import { authenticateUser, requireProfessor } from '../middleware/auth.js';
import {
  createInviteCode,
  listInviteCodes,
  listWaitlist,
  removeFromWaitlist,
} from '../services/betaInviteService.js';
import { sendBetaInvite } from '../services/emailService.js';
import { findUsersNeedingNudge, sendNudgeEmails } from '../services/nudgeService.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('BetaAdmin');
const router = Router();

// ============================================================
// Authenticated (non-admin) endpoint: submit feedback
// Mounted at /api/beta/feedback — before admin middleware
// ============================================================
router.post('/feedback', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, message, pageUrl } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Message is required (min 3 chars)' });
    }

    const validCategories = ['bug', 'feature', 'general', 'ux'];
    const safeCategory = validCategories.includes(category) ? category : 'general';

    const { error } = await supabaseAdmin
      .from('beta_feedback')
      .insert({
        user_id: userId,
        category: safeCategory,
        message: message.trim().slice(0, 2000),
        page_url: pageUrl?.slice(0, 500) || null,
      });

    if (error) {
      log.error('Failed to save feedback', { error });
      return res.status(500).json({ success: false, error: 'Failed to save feedback' });
    }

    res.json({ success: true, message: 'Thank you for your feedback!' });
  } catch (error) {
    log.error('Feedback error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to submit feedback' });
  }
});

// ============================================================
// Admin-only endpoints below
// ============================================================
const adminRouter = Router();
adminRouter.use(authenticateUser, requireProfessor);

// POST /api/beta/admin/invite — create invite + optionally send email
adminRouter.post('/invite', async (req, res) => {
  try {
    const { email, name, maxUses, expiresAt, sendEmail } = req.body;

    const invite = await createInviteCode({
      email,
      name,
      maxUses: maxUses || 1,
      expiresAt,
    });

    if (sendEmail && email) {
      try {
        await sendBetaInvite({
          toEmail: email,
          firstName: name || email.split('@')[0],
          inviteCode: invite.code,
        });
        log.info('Invite email sent', { email, code: invite.code });
      } catch (emailErr) {
        log.error('Invite email failed (code still created)', { error: emailErr.message });
      }
    }

    res.json({ success: true, data: invite });
  } catch (error) {
    log.error('Create invite error', { error: error.message });
    res.status(500).json({ success: false, error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' });
  }
});

// GET /api/beta/admin/invites — list all codes
adminRouter.get('/invites', async (req, res) => {
  try {
    const invites = await listInviteCodes();
    res.json({ success: true, data: invites });
  } catch (error) {
    log.error('List invites error', { error: error.message });
    res.status(500).json({ success: false, error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' });
  }
});

// GET /api/beta/admin/waitlist — list waitlist
adminRouter.get('/waitlist', async (req, res) => {
  try {
    const waitlist = await listWaitlist();
    res.json({ success: true, data: waitlist });
  } catch (error) {
    log.error('List waitlist error', { error: error.message });
    res.status(500).json({ success: false, error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' });
  }
});

// GET /api/beta/admin/feedback — list all feedback
adminRouter.get('/feedback', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('beta_feedback')
      .select('*, user:users!beta_feedback_user_id_fkey(id, email, first_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    log.error('List feedback error', { error: error.message });
    res.status(500).json({ success: false, error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' });
  }
});

// POST /api/beta/admin/invite-from-waitlist — convert waitlist to invite
adminRouter.post('/invite-from-waitlist', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const invite = await createInviteCode({ email, name });
    await removeFromWaitlist(email);

    // Send invite email
    try {
      await sendBetaInvite({
        toEmail: email,
        firstName: name || email.split('@')[0],
        inviteCode: invite.code,
      });
    } catch (emailErr) {
      log.error('Invite email failed', { error: emailErr.message });
    }

    res.json({ success: true, data: invite });
  } catch (error) {
    log.error('Invite from waitlist error', { error: error.message });
    res.status(500).json({ success: false, error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' });
  }
});

// GET /api/beta/admin/nudge-candidates — preview who would get nudged
adminRouter.get('/nudge-candidates', async (req, res) => {
  try {
    const candidates = await findUsersNeedingNudge();
    res.json({
      success: true,
      count: candidates.length,
      data: candidates.map(u => ({
        id: u.id,
        email: u.email,
        first_name: u.first_name,
        signed_up: u.created_at,
      })),
    });
  } catch (error) {
    log.error('Nudge candidates error', { error: error.message });
    res.status(500).json({ success: false, error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' });
  }
});

// POST /api/beta/admin/send-nudges — send platform nudge emails to all eligible users
adminRouter.post('/send-nudges', async (req, res) => {
  try {
    const result = await sendNudgeEmails();
    log.info('Nudge emails sent', result);
    res.json({ success: true, ...result });
  } catch (error) {
    log.error('Send nudges error', { error: error.message });
    res.status(500).json({ success: false, error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' });
  }
});

export { router as betaFeedbackRouter, adminRouter as betaAdminRouter };
