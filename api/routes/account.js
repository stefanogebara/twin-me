/**
 * Account Management Routes
 *
 * Handles account deletion and data export.
 * All routes require authentication.
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';

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
      console.error('[Account Delete] Database error:', deleteError.message);
      return res.status(500).json({ success: false, error: 'Failed to delete account' });
    }

    console.log(`[Account Delete] User ${userId} account deleted successfully`);

    return res.json({
      success: true,
      message: 'Account and all associated data have been permanently deleted.',
    });
  } catch (error) {
    console.error('[Account Delete] Error:', error);
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
    ] = await Promise.all([
      // Core profile
      supabaseAdmin.from('users').select('id, email, name, first_name, last_name, avatar_url, created_at, updated_at').eq('id', userId).single(),
      // Platform connections (exclude tokens)
      supabaseAdmin.from('platform_connections').select('platform, status, connected_at, last_sync_at').eq('user_id', userId),
      // Platform data summaries
      supabaseAdmin.from('user_platform_data').select('platform, data_type, data, extracted_at').eq('user_id', userId).order('extracted_at', { ascending: false }).limit(500),
      // Soul signature
      supabaseAdmin.from('soul_signatures').select('archetype_name, archetype_subtitle, narrative, defining_traits, color_scheme, is_public, reveal_level, created_at, updated_at').eq('user_id', userId),
      // Personality scores
      supabaseAdmin.from('personality_scores').select('openness, conscientiousness, extraversion, agreeableness, neuroticism, data_sources, created_at').eq('user_id', userId),
      // Twin conversations
      supabaseAdmin.from('twin_conversations').select('id, title, context_type, message_count, created_at, updated_at').eq('user_id', userId).order('created_at', { ascending: false }),
      // Enriched profile
      supabaseAdmin.from('enriched_profiles').select('full_name, company, title, location, bio, interests, social_links, discovered_photo, is_confirmed, created_at').eq('user_id', userId),
      // Onboarding calibration
      supabaseAdmin.from('onboarding_calibration').select('conversation_history, insights, archetype_hint, personality_summary, completed_at').eq('user_id', userId),
      // Memories
      supabaseAdmin.from('user_memories').select('memory_type, content, source, importance, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(500),
      // Big Five
      supabaseAdmin.from('big_five_scores').select('openness, conscientiousness, extraversion, agreeableness, neuroticism, assessment_type, created_at').eq('user_id', userId),
      // Behavioral patterns
      supabaseAdmin.from('behavioral_patterns').select('pattern_type, description, confidence, platforms, first_observed, last_observed').eq('user_id', userId).limit(200),
      // Reflection history
      supabaseAdmin.from('reflection_history').select('reflection_type, content, platforms_used, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(200),
      // Privacy settings
      supabaseAdmin.from('privacy_settings').select('cluster_visibility, sharing_preferences, updated_at').eq('user_id', userId),
    ]);

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
        .limit(1000);
      messages = msgData || [];
    }

    const exportData = {
      exported_at: new Date().toISOString(),
      user: userResult.data || null,
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
    console.error('[Account Export] Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to export data' });
  }
});

export default router;
