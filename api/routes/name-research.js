/**
 * Name Research API
 *
 * Uses Anthropic Claude + Web Search to research a person's name
 * and generate a biographical summary (Cofounder-inspired)
 */

import express from 'express';
import { complete, TIER_EXTRACTION } from '../services/llmGateway.js';

const router = express.Router();

/**
 * Research a person's name using Claude + web search
 * POST /api/name-research/research
 * Body: { fullName: string }
 */
router.post('/research', async (req, res) => {
  try {
    const { fullName } = req.body;

    if (!fullName || fullName.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid name'
      });
    }

    console.log('🔍 [Name Research] Researching:', fullName);

    // Call LLM Gateway
    const result = await complete({
      tier: TIER_EXTRACTION,
      messages: [
        {
          role: 'user',
          content: `Search the web for information about "${fullName}" and provide a brief biographical summary.

IMPORTANT INSTRUCTIONS:
- If this is a common name with no specific public figure, say: "I couldn't find specific public information about you, but that's okay! Your digital footprint will tell your unique story."
- If you find a notable person with this name, provide a 2-3 sentence summary of who they are
- Be concise and friendly in tone
- Focus on: profession, achievements, or what they're known for
- If multiple people share this name, mention the most notable one
- Do NOT make up information - only use what you can verify

Example outputs:
- For "Elon Musk": "You share a name with the entrepreneur and CEO of Tesla and SpaceX, known for pioneering electric vehicles and space exploration."
- For "John Smith": "I couldn't find specific public information about you, but that's okay! Your digital footprint will tell your unique story."
- For "Malala Yousafzai": "You share a name with the Pakistani education activist and youngest Nobel Prize laureate, known for advocating for girls' education rights worldwide."`
        }
      ],
      maxTokens: 1024,
      serviceName: 'nameResearch'
    });

    const summary = result.content;

    console.log('✅ [Name Research] Research complete');

    res.json({
      success: true,
      data: {
        fullName,
        summary,
        researched: !summary.includes("couldn't find specific"),
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ [Name Research] Error:', error);

    // Handle specific errors
    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again in a moment.'
      });
    }

    if (error.status === 401) {
      return res.status(500).json({
        success: false,
        error: 'API configuration error'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to research name. Please try again.',
      details: error.message
    });
  }
});

export default router;
