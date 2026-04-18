/**
 * Account Management Routes
 *
 * Handles account deletion and data export.
 * All routes require authentication.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

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
router.delete('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID not found in token' });
    }

    if (!supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    // Verify user exists before deletion
    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Delete user - CASCADE handles all related tables
    const { error: deleteError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userId);

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

    if (!supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    // Gather data from all user tables in parallel
    // Schema reality (2026-04): tables `personality_scores`, `big_five_scores`,
    // `reflection_history` do NOT exist — they were referenced from an older
    // migration that was never applied. Reflections live in `user_memories`
    // with memory_type='reflection'. Personality lives in
    // `user_personality_profiles` (stylometrics + sampling, no OCEAN columns).
    // `user_memories` has `importance_score` (not `importance`) and no `source` column.
    const [
      userResult,
      platformConnectionsResult,
      platformDataResult,
      soulSignaturesResult,
      personalityProfileResult,
      twinConversationsResult,
      enrichedProfilesResult,
      calibrationResult,
      memoriesResult,
      behavioralPatternsResult,
      privacySettingsResult,
    ] = await Promise.all([
      // Core profile
      supabaseAdmin.from('users').select('id, email, name, first_name, last_name, avatar_url, created_at, updated_at').eq('id', userId).single(),
      // Platform connections (exclude tokens)
      supabaseAdmin.from('platform_connections').select('platform, status, connected_at, last_sync_at').eq('user_id', userId),
      // Platform data summaries
      supabaseAdmin.from('user_platform_data').select('platform, data_type, data, extracted_at').eq('user_id', userId).order('extracted_at', { ascending: false }).limit(50000),
      // Soul signature
      supabaseAdmin.from('soul_signatures').select('archetype_name, archetype_subtitle, narrative, defining_traits, color_scheme, is_public, reveal_level, created_at, updated_at').eq('user_id', userId),
      // Personality profile (stylometrics + sampling params, real schema)
      supabaseAdmin.from('user_personality_profiles').select('avg_sentence_length, vocabulary_richness, formality_score, emotional_expressiveness, humor_markers, punctuation_style, temperature, top_p, frequency_penalty, presence_penalty, memory_count_at_build, confidence, last_built_at, created_at').eq('user_id', userId),
      // Twin conversations
      supabaseAdmin.from('twin_conversations').select('id, title, context_type, message_count, created_at, updated_at').eq('user_id', userId).order('created_at', { ascending: false }),
      // Enriched profile
      supabaseAdmin.from('enriched_profiles').select('full_name, company, title, location, bio, interests, social_links, discovered_photo, is_confirmed, created_at').eq('user_id', userId),
      // Onboarding calibration
      supabaseAdmin.from('onboarding_calibration').select('conversation_history, insights, archetype_hint, personality_summary, completed_at').eq('user_id', userId),
      // Memories — reflections also live here (memory_type='reflection')
      supabaseAdmin.from('user_memories').select('memory_type, content, importance_score, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50000),
      // Behavioral patterns
      supabaseAdmin.from('behavioral_patterns').select('pattern_type, description, confidence, platforms, first_observed, last_observed').eq('user_id', userId).limit(200),
      // Privacy settings
      supabaseAdmin.from('privacy_settings').select('cluster_visibility, sharing_preferences, updated_at').eq('user_id', userId),
    ]);

    // Fail loud on any query error — previously these were silently collapsed
    // into empty arrays via `|| []` which masked schema drift in production.
    const queryResults = {
      users: userResult,
      platform_connections: platformConnectionsResult,
      user_platform_data: platformDataResult,
      soul_signatures: soulSignaturesResult,
      user_personality_profiles: personalityProfileResult,
      twin_conversations: twinConversationsResult,
      enriched_profiles: enrichedProfilesResult,
      onboarding_calibration: calibrationResult,
      user_memories: memoriesResult,
      behavioral_patterns: behavioralPatternsResult,
      privacy_settings: privacySettingsResult,
    };
    for (const [tableName, result] of Object.entries(queryResults)) {
      if (result?.error) {
        log.error('GDPR export: query failed', {
          userId,
          table: tableName,
          code: result.error.code,
          message: result.error.message,
          details: result.error.details,
          hint: result.error.hint,
        });
        // Do NOT swallow — return 500 so the failure is visible to the caller and logs
        return res.status(500).json({
          success: false,
          error: `GDPR export failed on table ${tableName}: ${result.error.message}`,
          code: result.error.code,
        });
      }
    }

    // For twin messages, we need a different approach since subquery in .eq doesn't work
    // Fetch conversation IDs first, then messages
    const conversationIds = (twinConversationsResult.data || []).map(c => c.id);
    let messages = [];
    if (conversationIds.length > 0) {
      const { data: msgData } = await supabaseAdmin
        .from('twin_messages')
        .select('conversation_id, role, content, created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false })
        .limit(50000);
      messages = msgData || [];
    }

    const allMemories = memoriesResult.data || [];
    const exportData = {
      exported_at: new Date().toISOString(),
      user: userResult.data || null,
      platform_connections: platformConnectionsResult.data || [],
      platform_data: platformDataResult.data || [],
      soul_signatures: soulSignaturesResult.data || [],
      // user_personality_profiles: stylometrics + sampling params (real schema,
      // no OCEAN columns — those live only in the LLM-generated personality
      // prompt injection, not in the table)
      personality_profile: personalityProfileResult.data || [],
      twin_conversations: twinConversationsResult.data || [],
      twin_messages: messages,
      enriched_profiles: enrichedProfilesResult.data || [],
      onboarding_calibration: calibrationResult.data || [],
      memories: allMemories,
      // Reflections are stored in user_memories with memory_type='reflection'
      reflections: allMemories.filter(m => m.memory_type === 'reflection'),
      behavioral_patterns: behavioralPatternsResult.data || [],
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
 * PATCH /api/account/timezone
 *
 * Stores the user's IANA timezone string (detected from browser).
 * Non-blocking call from the frontend after auth verification.
 */
router.patch('/timezone', authenticateUser, async (req, res) => {
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
    const { error } = await supabaseAdmin
      .from('users')
      .update({ timezone })
      .eq('id', req.user.id);

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
