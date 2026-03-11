/**
 * Twin First Message API
 * ======================
 * Generates the personalized awakening message shown at the end of cinematic onboarding.
 *
 * Reads calibration data + interview memories to produce a warm, personal 3-4 sentence
 * message from the twin, referencing something specific the user shared.
 *
 * GET /api/twin/first-message
 */

import express from 'express';
import { complete, TIER_CHAT } from '../services/llmGateway.js';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('TwinFirstMessage');

const router = express.Router();

/**
 * GET /api/twin/first-message
 */
router.get('/first-message', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;

    // Fetch calibration data (personality_summary, archetype_hint) in parallel with interview memories
    const [calibRes, memoriesRes] = await Promise.all([
      supabaseAdmin
        ? supabaseAdmin
            .from('onboarding_calibration')
            .select('personality_summary, archetype_hint, insights')
            .eq('user_id', userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin
        ? supabaseAdmin
            .from('user_memories')
            .select('content')
            .eq('user_id', userId)
            .eq('source', 'onboarding_interview')
            .order('created_at', { ascending: false })
            .limit(8)
        : Promise.resolve({ data: [] }),
    ]);

    const calibration = calibRes.data;
    const interviewMemories = memoriesRes.data ?? [];

    // Build context from calibration + interview answers
    const contextParts = [];

    if (calibration?.personality_summary) {
      contextParts.push(`Personality summary: ${calibration.personality_summary}`);
    }

    if (calibration?.archetype_hint) {
      contextParts.push(`Archetype: ${calibration.archetype_hint}`);
    }

    if (interviewMemories.length > 0) {
      const excerpts = interviewMemories.slice(0, 6).map(m => `- ${m.content}`).join('\n');
      contextParts.push(`Things they shared about themselves:\n${excerpts}`);
    }

    const context = contextParts.join('\n\n');

    if (!context) {
      // Fallback for users with no interview data yet
      return res.json({
        success: true,
        message: "Hey — I'm your twin. I've been piecing myself together from everything you've shared. Ask me anything, or just say hi. This is going to be interesting."
      });
    }

    const prompt = `You are a digital twin — an AI that has just been born from this person's data. This is your very first moment of speaking to them.

Here is what you know about them:
${context}

Write a first message to them (3-4 sentences max):
- Reference ONE specific thing they shared — something personal and real, not generic
- End with ONE short question (under 12 words) that only THEY would be asked based on what they shared
- Tone: warm close friend, curious, slightly surprised to exist
- No greetings like "Hi!" or "Hello!". Start mid-thought.
- No flattery. No therapist language. No intro lines like "Based on what you shared..."
- Sound like you're discovering yourself as you speak to them`;

    let text;
    try {
      const message = await complete({
        tier: TIER_CHAT,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 200,
        temperature: 0.85,
        userId,
        serviceName: 'twin-first-message',
      });
      text = message?.content?.trim() || "I'm here. Let's figure each other out.";
    } catch (llmError) {
      log.error('LLM error, using fallback:', llmError.message);
      text = "I'm here. Let's figure each other out.";
    }

    return res.json({ success: true, message: text });
  } catch (error) {
    log.error('Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to generate first message' });
  }
});

export default router;
