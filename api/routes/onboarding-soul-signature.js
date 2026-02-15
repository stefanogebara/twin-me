/**
 * Onboarding Instant Soul Signature
 *
 * Generates a quick personality archetype from enrichment data + calibration Q&A.
 * This runs BEFORE any platform data is connected - it's the "first draft"
 * that gets refined as more data flows in.
 *
 * Much lighter than the full soul-signature/generate pipeline which requires
 * platform features + pattern detection + personality analysis.
 */

import express from 'express';
import { complete, TIER_CHAT } from '../services/llmGateway.js';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';

const router = express.Router();

/**
 * POST /api/onboarding/instant-signature
 *
 * Generates an initial soul signature from enrichment + calibration data.
 * Returns archetype name, core traits, and signature quote.
 */
router.post('/instant-signature', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { enrichmentContext, calibrationInsights, connectedPlatforms } = req.body;

    if (!enrichmentContext) {
      return res.status(400).json({ success: false, error: 'enrichmentContext required' });
    }

    // Fetch calibration data from DB if not provided
    let insights = calibrationInsights || [];
    let archetypeHint = '';
    let personalitySummary = '';

    if (insights.length === 0 && userId && supabaseAdmin) {
      const { data } = await supabaseAdmin
        .from('onboarding_calibration')
        .select('insights, archetype_hint, personality_summary')
        .eq('user_id', userId)
        .single();

      if (data) {
        insights = data.insights || [];
        archetypeHint = data.archetype_hint || '';
        personalitySummary = data.personality_summary || '';
      }
    }

    const systemPrompt = `You are generating an initial "Soul Signature" - a personality archetype card for a new user of Twin Me.

DATA AVAILABLE:
- Name: ${enrichmentContext.name || 'Unknown'}
- Company: ${enrichmentContext.company || 'Not provided'}
- Title: ${enrichmentContext.title || 'Not provided'}
- Location: ${enrichmentContext.location || 'Not provided'}
- Bio: ${enrichmentContext.bio || 'Not provided'}
${insights.length > 0 ? `- Personality Insights from Q&A: ${insights.join('; ')}` : ''}
${archetypeHint ? `- Archetype Hint: ${archetypeHint}` : ''}
${personalitySummary ? `- Personality Summary: ${personalitySummary}` : ''}
${connectedPlatforms?.length > 0 ? `- Connected Platforms: ${connectedPlatforms.join(', ')}` : '- No platforms connected yet'}

Generate a soul signature that feels like looking in a mirror. The archetype should be specific and evocative, not generic.

BAD: "The Ambitious Leader", "The Creative Mind", "The Hard Worker"
GOOD: "The Midnight Architect", "The Curious Wanderer", "The Pattern Whisperer"

Respond in this exact JSON format:
{
  "archetype_name": "The [Evocative Name]",
  "core_traits": [
    {"trait": "Trait Name", "source": "Brief evidence from their data"},
    {"trait": "Trait Name", "source": "Brief evidence from their data"},
    {"trait": "Trait Name", "source": "Brief evidence from their data"}
  ],
  "signature_quote": "A 1-sentence poetic description of who they are",
  "first_impression": "A 2-3 sentence warm, personal paragraph about what makes them unique"
}`;

    const result = await complete({
      tier: TIER_CHAT,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Generate my soul signature based on what you know about me.' }],
      maxTokens: 512,
      temperature: 0.8,
      userId,
      serviceName: 'onboarding-instant-signature',
    });

    let signature = null;
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        signature = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // If parsing fails, create a simple signature
      signature = {
        archetype_name: archetypeHint || 'The Digital Explorer',
        core_traits: [],
        signature_quote: personalitySummary || result.content,
        first_impression: result.content,
      };
    }

    // Save initial signature to database (matches existing soul_signatures schema)
    if (userId && supabaseAdmin && signature) {
      supabaseAdmin
        .from('soul_signatures')
        .upsert({
          user_id: userId,
          archetype_name: signature.archetype_name,
          archetype_subtitle: signature.signature_quote,
          narrative: signature.first_impression,
          defining_traits: signature.core_traits,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        .then(({ error }) => {
          if (error) console.warn('[Instant Signature] Save error:', error.message);
        });
    }

    // Generate a first-person twin introduction
    let twinIntro = '';
    try {
      const introResult = await complete({
        tier: TIER_CHAT,
        system: `You are ${enrichmentContext.name || 'someone'}'s digital twin that just came to life. Write a 2-3 sentence first-person introduction. Be warm, a little playful, and reference their archetype and personality. Speak as if you ARE them - not about them. Don't use quotes around your response.

Their archetype: ${signature.archetype_name}
Their signature quote: ${signature.signature_quote}
Their first impression: ${signature.first_impression}`,
        messages: [{ role: 'user', content: 'Introduce yourself as my twin.' }],
        maxTokens: 150,
        temperature: 0.8,
        userId,
        serviceName: 'onboarding-twin-intro',
      });
      twinIntro = introResult.content;
    } catch (introErr) {
      console.warn('[Instant Signature] Twin intro generation failed:', introErr.message);
      twinIntro = `Hey, I'm your twin. I'm ${signature.archetype_name} - ${signature.signature_quote}. Want to keep talking?`;
    }

    return res.json({
      success: true,
      signature,
      twinIntro,
    });
  } catch (error) {
    console.error('[Instant Signature] Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to generate signature' });
  }
});

export default router;
