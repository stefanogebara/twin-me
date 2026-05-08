/**
 * Twin Chat — ancillary endpoints
 * ================================
 * Extracted from twin-chat.js (audit ARCH-1: 1830-LOC monolith reduction).
 * These five handlers are independent of the streaming POST /message
 * pipeline — pure CRUD over twin_conversations / twin_messages plus the
 * /context dashboard rollup and the /intro greeting generator.
 *
 * Mounted on both /api/chat AND /api/twin in server.js (matches the
 * legacy dual-mount of twin-chat.js).
 *
 *   GET  /conversations  — list user's conversations
 *   GET  /history        — fetch messages for a conversation
 *   GET  /context        — sidebar context (twin summary + memory stats + insights)
 *   POST /chat           — legacy 410-gone placeholder
 *   GET  /intro          — first-visit greeting (LLM, cached per user)
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { serverDb, supabaseAdmin } from '../services/database.js';
import { complete, TIER_CHAT } from '../services/llmGateway.js';
import { getMemoryStats } from '../services/memoryStreamService.js';
import { getTwinSummary } from '../services/twinSummaryService.js';
import { deduplicateByTheme } from '../services/twinSystemPromptBuilder.js';
import { getSoulSignature } from '../services/soulSignatureService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('TwinChatHistory');
const router = express.Router();

// ====================================================================
// GET /conversations — list user's conversations
// ====================================================================
router.get('/conversations', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    const { data, error } = await supabaseAdmin
      .from('twin_conversations')
      .select(`
        id,
        title,
        mode,
        updated_at,
        created_at
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(500).json({ success: false, error: 'Failed to fetch conversations' });
    }

    // For each conversation, get the last message preview
    const conversations = await Promise.all(
      (data || []).map(async (conv) => {
        const { data: lastMsg } = await supabaseAdmin
          .from('twin_messages')
          .select('content, role, created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        return {
          id: conv.id,
          title: conv.title,
          lastMessage: lastMsg?.content?.substring(0, 100) || null,
          lastMessageRole: lastMsg?.role || null,
          updatedAt: conv.updated_at,
          createdAt: conv.created_at,
        };
      })
    );

    // Filter out conversations with no messages
    const withMessages = conversations.filter(c => c.lastMessage);

    res.json({ success: true, conversations: withMessages });
  } catch (err) {
    log.error('List conversations failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to list conversations' });
  }
});

// ====================================================================
// GET /history?conversationId=<uuid> — messages for a conversation
// ====================================================================
const CONVERSATION_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/history', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.query;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        error: 'Conversation ID is required'
      });
    }

    if (!CONVERSATION_UUID_RE.test(conversationId)) {
      return res.status(400).json({ success: false, error: 'Invalid conversation ID' });
    }

    // Verify ownership: only return messages for conversations belonging to this user
    const { data: convo, error: convoErr } = await supabaseAdmin
      .from('twin_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();

    if (convoErr || !convo) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const { data: messagesData } = await serverDb.getMessagesByConversation(conversationId, 50);

    res.json({
      success: true,
      messages: (messagesData || []).map(m => ({
        id: m.id,
        content: m.content,
        isUser: m.is_user_message,
        createdAt: m.created_at
      }))
    });

  } catch (error) {
    log.error('History error', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversation history'
    });
  }
});

// ====================================================================
// GET /context — sidebar rollup (twin summary + memory stats + pending insights)
// ====================================================================
router.get('/context', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const withTimeout = (promise, ms) => Promise.race([
      promise,
      new Promise(resolve => setTimeout(() => resolve(null), ms)),
    ]);
    const [twinSummary, memoryStats, insightsResult] = await Promise.all([
      withTimeout(getTwinSummary(userId).catch(() => null), 8000),
      getMemoryStats(userId).catch(() => ({ total: 0, byType: {} })),
      (async () => {
        const { data, error: insightsErr } = await supabaseAdmin
          .from('proactive_insights')
          .select('id, insight, category, urgency, created_at, metadata')
          .eq('user_id', userId)
          .eq('delivered', false)
          .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(20); // Fetch more so dedup has a wider pool
        if (insightsErr) log.warn('Failed to fetch pending insights', { error: insightsErr });
        const raw = data || [];
        return deduplicateByTheme(raw, i => i.insight, { threshold: 0.35, maxItems: 10 });
      })(),
    ]);

    if (res.headersSent) return;
    res.json({
      success: true,
      twinSummary: twinSummary || null,
      memoryStats,
      pendingInsights: insightsResult,
    });
  } catch (error) {
    log.error('Context endpoint error', { error });
    if (res.headersSent) return;
    res.status(500).json({
      success: false,
      error: 'Failed to fetch twin context',
    });
  }
});

// ====================================================================
// POST /chat — legacy placeholder (use /message instead)
// ====================================================================
router.post('/chat', authenticateUser, (req, res) => {
  res.status(410).json({
    error: 'This endpoint is gone. Please use POST /api/chat/message instead.'
  });
});

// ====================================================================
// GET /intro — first-visit personalized greeting
// ====================================================================
router.get('/intro', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if user already has conversation messages — intro only for fresh users
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('twin_conversations')
      .select('id')
      .eq('user_id', userId)
      .limit(1);
    if (existingErr) {
      log.warn('/intro first-visit check error', { error: existingErr });
      // Fail safe: skip intro rather than risk a duplicate on DB errors
      return res.json({ success: true, intro: null, reason: 'db_error' });
    }
    if (existing && existing.length > 0) {
      return res.json({ success: true, intro: null, reason: 'not_first_visit' });
    }

    // Fetch soul signature (latest row, via shared accessor — 90s in-process cache)
    const sig = await getSoulSignature(userId, {
      select: 'archetype_name, archetype_subtitle, narrative, defining_traits',
    });

    // Fetch display name
    const { data: userRow, error: userRowErr } = await supabaseAdmin
      .from('users')
      .select('first_name, email')
      .eq('id', userId)
      .single();
    if (userRowErr && userRowErr.code !== 'PGRST116') log.error('User row fetch error', { error: userRowErr });
    const firstName = userRow?.first_name || userRow?.email?.split('@')[0] || null;

    // Fetch enrichment bio/interests as extra context
    const { data: enrichment, error: enrichmentErr } = await supabaseAdmin
      .from('enriched_profiles')
      .select('discovered_bio, interests_and_hobbies, personality_traits')
      .eq('user_id', userId)
      .single();
    if (enrichmentErr && enrichmentErr.code !== 'PGRST116') log.error('Enrichment fetch error', { error: enrichmentErr });

    // Build a minimal prompt for the greeting
    const archetypeBlock = sig
      ? `Archetype: ${sig.archetype_name}${sig.archetype_subtitle ? ` — ${sig.archetype_subtitle}` : ''}\n${sig.narrative ? `Description: ${sig.narrative}` : ''}`
      : 'No archetype yet';
    const traitsBlock = (() => {
      if (!sig?.defining_traits) return '';
      const traits = Array.isArray(sig.defining_traits)
        ? sig.defining_traits.slice(0, 3).map(t => (typeof t === 'object' ? t.trait || t : t)).join(', ')
        : String(sig.defining_traits).substring(0, 200);
      return traits ? `Core traits: ${traits}` : '';
    })();
    const enrichmentBlock = [
      enrichment?.interests_and_hobbies ? `Interests: ${String(enrichment.interests_and_hobbies).substring(0, 200)}` : '',
      enrichment?.personality_traits ? `Personality: ${String(enrichment.personality_traits).substring(0, 200)}` : '',
    ].filter(Boolean).join('\n');

    const greetingPrompt = `You are someone's digital twin — their AI reflection that truly knows them. You are about to say hello to ${firstName || 'your person'} for the very first time.

What you know about them:
${archetypeBlock}
${traitsBlock}
${enrichmentBlock || 'Still learning about you.'}

Write a short, warm, genuinely curious greeting (2-3 sentences max).
- Greet them by first name if known
- Reference their archetype or a specific trait naturally — not generically
- End with an open, curious question that invites them to explore something together
- Speak as their twin — intimate, direct, a bit knowing
- No fluff, no "I'm an AI" disclaimers, no corporate language
- Sound like someone who already knows them a little and is eager to know them better`;

    const result = await complete({
      tier: TIER_CHAT,
      messages: [{ role: 'user', content: greetingPrompt }],
      maxTokens: 150,
      temperature: 0.8,
      userId,
      serviceName: 'twin-chat-intro',
    });
    const intro = result?.content?.trim() || null;

    res.json({ success: true, intro });
  } catch (err) {
    log.error('/intro error', { error: err });
    res.json({ success: true, intro: null }); // Non-fatal — just show empty state
  }
});

export default router;
