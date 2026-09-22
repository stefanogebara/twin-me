/**
 * Beta Signup Routes
 *
 * POST /api/beta/signup    - Submit beta application (public, no auth)
 * GET  /api/beta/status    - Check beta status for current user (auth required)
 * POST /api/beta/activate  - Activate a beta user (auto-approve for now)
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import { findApplicationByEmail, insertApplication, updateApplicationByEmail, updateApplicationById, upsertWaitlist, findUserByEmail, findUserById, createUser } from '../services/beta/betaStore.js';
import { createInviteCode } from '../services/betaInviteService.js';
import { authenticateUser } from '../middleware/auth.js';
import { createLogger } from '../services/logger.js';
import { validate } from '../middleware/validate.js';
import * as V from './stayingSchemas.js';
import { quietly } from '../services/quietly.js';

const log = createLogger('BetaSignup');
const router = Router();

// linkedin, reddit and twitch removed (replan-2026-06-10 Track C portfolio
// cut) — do not collect beta interest for platforms we no longer connect.
const VALID_PLATFORMS = [
  'spotify',
  'calendar',
  'youtube',
  'whoop',
  'discord',
  'gmail',
  'github',
];

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many signup attempts. Please try again later.' },
});

/**
 * POST /api/beta/signup
 * Public endpoint -- submits a beta application and auto-approves.
 * Creates a user account (if none exists) and returns an invite code.
 */
router.post('/signup', signupLimiter, validate({ body: V.BETA_SIGNUP }), async (req, res) => {
  try {
    const { name, email, platforms, reason } = req.body;

    // --- Input validation ---
    if (!name || typeof name !== 'string' || name.trim().length < 1) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    if (name.trim().length > 100) {
      return res.status(400).json({ success: false, error: 'Name is too long' });
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Valid email is required' });
    }
    if (!Array.isArray(platforms)) {
      return res.status(400).json({ success: false, error: 'Platforms must be an array' });
    }
    const safePlatforms = platforms
      .filter(p => typeof p === 'string' && VALID_PLATFORMS.includes(p.toLowerCase()))
      .map(p => p.toLowerCase());

    if (reason && typeof reason === 'string' && reason.length > 2000) {
      return res.status(400).json({ success: false, error: 'Reason is too long (max 2000 characters)' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim().slice(0, 100);
    const safeReason = reason ? String(reason).trim().slice(0, 2000) : null;

    // --- Check for existing application ---
    const { data: existing } = await findApplicationByEmail(normalizedEmail, 'id, invite_code, status');

    if (existing) {
      // Already applied -- return existing invite code if approved
      if (existing.invite_code) {
        return res.json({
          success: true,
          alreadyApplied: true,
          inviteCode: existing.invite_code,
          message: 'You already have a beta invite.',
        });
      }
      return res.json({
        success: true,
        alreadyApplied: true,
        message: 'Your application is being reviewed.',
      });
    }

    // --- Auto-approve: create invite code ---
    const invite = await createInviteCode({
      email: normalizedEmail,
      name: trimmedName,
      maxUses: 1,
    });

    // --- Create the application record ---
    const { error: insertErr } = await insertApplication({
        name: trimmedName,
        email: normalizedEmail,
        platforms: safePlatforms,
        reason: safeReason,
        status: 'approved',
        invite_code: invite.code,
        approved_at: new Date().toISOString(),
      });

    if (insertErr) {
      log.error('Failed to insert beta application', { error: insertErr });
      return res.status(500).json({ success: false, error: 'Failed to save application' });
    }

    // --- Auto-create user account if they don't have one ---
    const { data: existingUser } = await findUserByEmail(normalizedEmail, 'id');

    let userId = existingUser?.id;
    if (!userId) {
      // Create user with a random password (they'll sign in via invite code flow)
      const randomPassword = await bcrypt.hash(
        `beta-${Date.now()}-${Math.random().toString(36)}`,
        10
      );
      const nameParts = trimmedName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const { data: newUser, error: userErr } = await createUser({
          email: normalizedEmail,
          password_hash: randomPassword,
          first_name: firstName.slice(0, 100),
          last_name: lastName.slice(0, 100),
        }, 'id');

      if (userErr) {
        // Non-fatal: the invite code is still valid, user can sign up manually
        log.warn('Failed to auto-create user (non-blocking)', { error: userErr });
      } else {
        userId = newUser.id;
      }
    }

    // Link application to user
    if (userId) {
      await updateApplicationByEmail(normalizedEmail, { user_id: userId });
    }

    // Also add to waitlist for tracking (upsert)
    await upsertWaitlist({ email: normalizedEmail, name: trimmedName, source: 'beta_signup' }).then(() => {}).catch(quietly('beta/upsert', () => {}));

    log.info('Beta application approved', {
      email: normalizedEmail,
      code: invite.code,
      platforms: safePlatforms,
    });

    res.json({
      success: true,
      inviteCode: invite.code,
      message: "You're in! Use this invite code to sign in.",
    });
  } catch (error) {
    log.error('Beta signup error', { error: error.message });
    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
});

/**
 * GET /api/beta/status
 * Returns beta status for the authenticated user.
 */
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { data: user } = await findUserById(userId, 'id, email, invite_code_id');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check if they have an application
    const { data: application } = await findApplicationByEmail(user.email, 'status, platforms, created_at, approved_at');

    // Check if they redeemed an invite code
    const isBetaUser = !!user.invite_code_id;

    res.json({
      success: true,
      isBetaUser,
      application: application || null,
    });
  } catch (error) {
    log.error('Beta status error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to check beta status' });
  }
});

/**
 * POST /api/beta/activate
 * Activates a pending beta application (currently unused since auto-approve is on).
 * Could be used by admin later.
 */
router.post('/activate', authenticateUser, validate({ body: V.BETA_ACTIVATE }), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const { data: application } = await findApplicationByEmail(normalizedEmail, 'id, status, invite_code');

    if (!application) {
      return res.status(404).json({ success: false, error: 'No application found for this email' });
    }

    if (application.status === 'approved' && application.invite_code) {
      return res.json({
        success: true,
        inviteCode: application.invite_code,
        message: 'Already approved',
      });
    }

    // Create invite and update application
    const invite = await createInviteCode({
      email: normalizedEmail,
      maxUses: 1,
    });

    await updateApplicationById(application.id, {
        status: 'approved',
        invite_code: invite.code,
        approved_at: new Date().toISOString(),
      });

    res.json({
      success: true,
      inviteCode: invite.code,
      message: 'Application approved',
    });
  } catch (error) {
    log.error('Beta activate error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to activate application' });
  }
});

export default router;
