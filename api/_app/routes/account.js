/**
 * Account Management Routes
 *
 * Handles account deletion and data export.
 * All routes require authentication.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { databaseAvailable, deleteUser, exportMessages, exportReads, findUserById, updateUser } from '../services/account/accountStore.js';
import { createLogger } from '../services/logger.js';
import { getAllSoulSignatures } from '../services/soulSignatureService.js';
import { validate } from '../middleware/validate.js';
import * as V from './stayingSchemas.js';

const log = createLogger('Account');

const router = express.Router();

/**
 * DELETE /api/account
 *
 * Permanently deletes the authenticated user's account and all associated data.
 * PostgreSQL CASCADE constraints handle all child table deletions automatically.
 *
 * Tables with ON DELETE CASCADE from users(id):
 * - platform_connections, user_platform_data, platform_data
 * - soul_signatures, personality_scores, behavioral_features, unique_patterns
 * - twin_conversations (-> twin_messages via cascade), twin_personality_profiles, twin_chat_usage
 * - enriched_profiles, onboarding_calibration, origin_data
 * - behavioral_patterns, behavioral_evidence, behavioral_deviations
 * - brain_nodes (-> brain_edges via cascade), brain_snapshots, brain_activity_log
 * - user_memories, reflection_history, life_context
 * - big_five_scores, big_five_responses, facet_scores
 * - pattern_hypotheses, discovered_correlations, proactive_insights
 * - privacy_settings, privacy_audit_log, audience_configurations
 * - proactive_triggers (-> trigger_executions via cascade)
 * - And ~20 more tables
 *
 * Tables with ON DELETE SET NULL (anonymized, not deleted):
 * - analytics_events, analytics_sessions, llm_usage_log
 */
router.get('/profile', authenticateUser, async (req, res) => {
  // audit-2026-05-09 S-L1: explicit allowlist instead of returning the full
  // decoded JWT payload. Internal claims like iat/exp/sub aren't useful to
  // the client and shouldn't be exposed.
  const u = req.user || {};
  return res.json({
    success: true,
    user: {
      id: u.id || u.userId || null,
      email: u.email || null,
      firstName: u.firstName || null,
    },
  });
});

router.delete('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID not found in token' });
    }

    if (!databaseAvailable()) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    // Verify user exists before deletion
    const { data: user, error: fetchError } = await findUserById(userId, 'id, email');

    if (fetchError || !user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Delete user - CASCADE handles all related tables
    const { error: deleteError } = await deleteUser(userId);

    if (deleteError) {
      log.error('Database error:', deleteError.message);
      return res.status(500).json({ success: false, error: 'Failed to delete account' });
    }

    log.info(`User ${userId} account deleted successfully`);

    return res.json({
      success: true,
      message: 'Account and all associated data have been permanently deleted.',
    });
  } catch (error) {
    log.error('Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete account' });
  }
});

/**
 * GET /api/account/export
 *
 * Exports all user data as a JSON object.
 * Gathers data from all relevant tables for the authenticated user.
 */
router.get('/export', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID not found in token' });
    }

    if (!databaseAvailable()) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    // Gather data from all user tables in parallel
    const [
      userResult,
      platformConnectionsResult,
      platformDataResult,
      soulSignaturesResult,
      personalityScoresResult,
      twinConversationsResult,
      enrichedProfilesResult,
      calibrationResult,
      memoriesResult,
      bigFiveResult,
      behavioralPatternsResult,
      reflectionHistoryResult,
      privacySettingsResult,
    ] = await Promise.all((() => {
      /* Every table a person's data lives in, read through accountStore; the soul signature
         history has its own service and keeps its place in the list. */
      const reads = exportReads(userId);
      return [
        ...reads.slice(0, 3),
      getAllSoulSignatures(userId, { columns: 'archetype_name, archetype_subtitle, narrative, defining_traits, color_scheme, is_public, reveal_level, created_at, updated_at' }).then(data => ({ data })),
        ...reads.slice(3),
      ];
    })());

    // For twin messages, we need a different approach since subquery in .eq doesn't work
    // Fetch conversation IDs first, then messages
    const conversationIds = (twinConversationsResult.data || []).map(c => c.id);
    let messages = [];
    if (conversationIds.length > 0) {
      const { data: msgData } = await exportMessages(conversationIds);
      messages = msgData || [];
    }

    // Fallback to JWT user data if public.users row is missing
    const userData = userResult.data || {
      id: userId,
      email: req.user.email,
      name: req.user.name,
    };

    const exportData = {
      exported_at: new Date().toISOString(),
      user: userData,
      platform_connections: platformConnectionsResult.data || [],
      platform_data: platformDataResult.data || [],
      soul_signatures: soulSignaturesResult.data || [],
      personality_scores: personalityScoresResult.data || [],
      twin_conversations: twinConversationsResult.data || [],
      twin_messages: messages,
      enriched_profiles: enrichedProfilesResult.data || [],
      onboarding_calibration: calibrationResult.data || [],
      memories: memoriesResult.data || [],
      big_five_scores: bigFiveResult.data || [],
      behavioral_patterns: behavioralPatternsResult.data || [],
      reflection_history: reflectionHistoryResult.data || [],
      privacy_settings: privacySettingsResult.data || [],
    };

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="twin-me-export-${new Date().toISOString().split('T')[0]}.json"`);

    return res.json({
      success: true,
      data: exportData,
    });
  } catch (error) {
    log.error('Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to export data' });
  }
});

/**
 * GET /api/account/timezone
 *
 * Returns the persisted IANA timezone for the authenticated user (or null
 * when never set). audit-2026-07-03: Settings.tsx was already calling this
 * to display the saved value, but only PATCH existed — every Settings visit
 * 404'd. Reading from the profile isn't an option: /auth/verify doesn't
 * return the timezone column.
 */
router.get('/timezone', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await findUserById(req.user.id, 'timezone');

    if (error) {
      log.warn('Failed to fetch timezone', { userId: req.user.id, error: error.message });
      return res.status(500).json({ success: false, error: 'Failed to fetch timezone' });
    }

    return res.json({ success: true, timezone: data?.timezone ?? null });
  } catch (err) {
    log.error('Timezone fetch error', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch timezone' });
  }
});

/** The languages TwinMe speaks; the value is what users.preferred_language holds. */
const LANGUAGES = ['en', 'es', 'pt-BR'];

/** GET /api/account/language: the language they chose, or null when never asked. */
router.get('/language', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await findUserById(req.user.id, 'preferred_language');
    if (error) return res.status(500).json({ success: false, error: 'Failed to fetch language' });
    return res.json({ success: true, language: data?.preferred_language ?? null, languages: LANGUAGES });
  } catch (err) {
    log.error('Language fetch error', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch language' });
  }
});

/** PATCH /api/account/language { language }: one of en, es, pt-BR. */
router.patch('/language', authenticateUser, validate({ body: V.ACCOUNT_LANGUAGE }), async (req, res) => {
  const language = typeof req.body?.language === 'string' ? req.body.language : '';
  if (!LANGUAGES.includes(language)) return res.status(400).json({ success: false, error: 'language must be one of en, es, pt-BR' });
  try {
    const { error } = await updateUser(req.user.id, { preferred_language: language });
    if (error) return res.status(500).json({ success: false, error: 'Failed to update language' });
    return res.json({ success: true, language });
  } catch (err) {
    log.error('Language update error', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to update language' });
  }
});

/**
 * PATCH /api/account/timezone
 *
 * Stores the user's IANA timezone string (detected from browser).
 * Non-blocking call from the frontend after auth verification.
 */
router.patch('/timezone', authenticateUser, validate({ body: V.ACCOUNT_TIMEZONE }), async (req, res) => {
  const { timezone } = req.body;

  if (!timezone || typeof timezone !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid timezone' });
  }

  // Validate it's a real IANA timezone
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid IANA timezone' });
  }

  try {
    const { error } = await updateUser(req.user.id, { timezone });

    if (error) {
      log.warn('Failed to update timezone', { userId: req.user.id, error: error.message });
      return res.status(500).json({ success: false, error: 'Failed to update timezone' });
    }

    return res.json({ success: true });
  } catch (err) {
    log.error('Timezone update error', { userId: req.user.id, error: err.message });
    return res.status(500).json({ success: false, error: 'Failed to update timezone' });
  }
});

export default router;
