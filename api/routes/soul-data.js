/**
 * Soul Data API Routes
 * Endpoints for data extraction, processing, and RAG-powered chat
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Use SUPABASE_URL (backend) - fallback to VITE_ prefix for compatibility
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

import dataExtractionService from '../services/dataExtractionService.js';
import textProcessor from '../services/textProcessor.js';
import stylometricAnalyzer from '../services/stylometricAnalyzer.js';
import embeddingGenerator from '../services/embeddingGenerator.js';
import ragService from '../services/ragService.js';
import soulSignatureBuilder from '../services/soulSignatureBuilder.js';

/**
 * POST /api/soul-data/extract/:platform
 * Trigger data extraction for a specific platform
 */
router.post('/extract/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.body.userId || req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const validPlatforms = ['github', 'discord', 'linkedin', 'spotify', 'reddit', 'youtube'];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({
        success: false,
        error: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`
      });
    }

    console.log(`[API] Starting extraction for ${platform}, user: ${userId}`);

    // Trigger extraction (this may take a while)
    const result = await dataExtractionService.extractPlatformData(userId, platform);

    res.json({
      success: true,
      platform,
      ...result
    });
  } catch (error) {
    console.error('[API] Error in /extract/:platform:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/soul-data/extract-all
 * Trigger data extraction for all connected platforms
 */
router.post('/extract-all', async (req, res) => {
  try {
    const userId = req.body.userId || req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`[API] Starting extraction for all platforms, user: ${userId}`);

    // Trigger extraction for all platforms
    const result = await dataExtractionService.extractAllPlatforms(userId);

    res.json(result);
  } catch (error) {
    console.error('[API] Error in /extract-all:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/soul-data/extraction-status
 * Get extraction status for a user
 */
router.get('/extraction-status', async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const status = await dataExtractionService.getExtractionStatus(userId);

    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('[API] Error in /extraction-status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/soul-data/process
 * Trigger text processing for extracted data
 */
router.post('/process', async (req, res) => {
  try {
    const userId = req.body.userId || req.query.userId;
    const limit = parseInt(req.body.limit || req.query.limit || '100');

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`[API] Starting text processing for user: ${userId}`);

    const result = await textProcessor.processUserData(userId, limit);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[API] Error in /process:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/soul-data/processing-stats
 * Get processing statistics
 */
router.get('/processing-stats', async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const stats = await textProcessor.getProcessingStats(userId);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[API] Error in /processing-stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/soul-data/analyze-style
 * Trigger stylometric analysis
 */
router.post('/analyze-style', async (req, res) => {
  try {
    const userId = req.body.userId || req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`[API] Starting stylometric analysis for user: ${userId}`);

    // Call the analyzer with comprehensive error handling
    const result = await stylometricAnalyzer.analyzeUserStyle(userId);

    // Check if the result indicates failure (insufficient data, etc.)
    if (!result.success) {
      console.log(`[API] Analysis completed with warnings: ${result.message}`);
      return res.status(200).json({
        success: false,
        error: result.message || 'Insufficient data for analysis',
        details: {
          samplesAnalyzed: result.samplesAnalyzed || 0,
          textLength: result.textLength || 0,
          wordCount: result.wordCount || 0
        }
      });
    }

    // Success case
    console.log(`[API] Style analysis completed successfully`);
    res.json(result);

  } catch (error) {
    console.error('[API] Error in /analyze-style:', error);
    console.error('[API] Error stack:', error.stack);

    // Return detailed error information
    res.status(500).json({
      success: false,
      error: 'Failed to analyze communication style',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? {
        stack: error.stack,
        name: error.name
      } : undefined
    });
  }
});

/**
 * GET /api/soul-data/style-profile
 * Get user's style profile
 */
router.get('/style-profile', async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const profile = await stylometricAnalyzer.getStyleProfile(userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Style profile not found. Run /analyze-style first.'
      });
    }

    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('[API] Error in /style-profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/soul-data/generate-embeddings
 * Generate embeddings for text content
 */
router.post('/generate-embeddings', async (req, res) => {
  try {
    const userId = req.body.userId || req.query.userId;
    const limit = parseInt(req.body.limit || req.query.limit || '100');

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`[API] Starting embedding generation for user: ${userId}`);

    const result = await embeddingGenerator.generateEmbeddings(userId, limit);

    res.json(result);
  } catch (error) {
    console.error('[API] Error in /generate-embeddings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/soul-data/embedding-stats
 * Get embedding statistics
 */
router.get('/embedding-stats', async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const stats = await embeddingGenerator.getEmbeddingStats(userId);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[API] Error in /embedding-stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/soul-data/rag/chat
 * RAG-powered chat endpoint
 */
router.post('/rag/chat', async (req, res) => {
  try {
    const { userId, twinId, message, conversationHistory } = req.body;

    if (!userId || !message) {
      return res.status(400).json({
        success: false,
        error: 'userId and message are required'
      });
    }

    console.log(`[API] RAG chat request from user: ${userId}, message length: ${message.length}`);
    console.log(`[API] Conversation history length: ${conversationHistory?.length || 0}`);

    // Check if ragService is properly initialized
    if (!ragService || typeof ragService.chat !== 'function') {
      console.error('[API] ragService not properly initialized');
      return res.status(500).json({
        success: false,
        error: 'Chat service not available. Please try again later.'
      });
    }

    const result = await ragService.chat(
      userId,
      twinId || null,
      message,
      conversationHistory || []
    );

    console.log(`[API] RAG chat response generated successfully`);
    res.json(result);
  } catch (error) {
    console.error('[API] Error in /rag/chat:', error);
    console.error('[API] Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process chat message',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/soul-data/rag/conversation-history
 * Get conversation history for a twin
 */
router.get('/rag/conversation-history', async (req, res) => {
  try {
    const { userId, twinId } = req.query;
    const limit = parseInt(req.query.limit || '10');

    if (!userId || !twinId) {
      return res.status(400).json({
        success: false,
        error: 'userId and twinId are required'
      });
    }

    const history = await ragService.getConversationHistory(userId, twinId, limit);

    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('[API] Error in /rag/conversation-history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/soul-data/full-pipeline
 * Run the complete pipeline: extract → process → analyze → embed
 */
router.post('/full-pipeline', async (req, res) => {
  try {
    const userId = req.body.userId || req.query.userId;
    const platform = req.body.platform || req.query.platform;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`[API] Running full pipeline for user: ${userId}`);

    const results = {
      extraction: null,
      processing: null,
      analysis: null,
      embeddings: null
    };

    // Step 1: Extract data
    if (platform) {
      results.extraction = await dataExtractionService.extractPlatformData(userId, platform);
    } else {
      results.extraction = await dataExtractionService.extractAllPlatforms(userId);
    }

    // Step 2: Process text
    results.processing = await textProcessor.processUserData(userId, 100);

    // Step 3: Analyze style
    results.analysis = await stylometricAnalyzer.analyzeUserStyle(userId);

    // Step 4: Generate embeddings
    results.embeddings = await embeddingGenerator.generateEmbeddings(userId, 100);

    // Step 5: Build soul signature
    results.soulSignature = await soulSignatureBuilder.buildSoulSignature(userId);

    res.json({
      success: true,
      message: 'Full pipeline completed',
      results
    });
  } catch (error) {
    console.error('[API] Error in /full-pipeline:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/soul-data/build-soul-signature
 * Build soul signature from extracted data
 */
router.post('/build-soul-signature', async (req, res) => {
  try {
    const userId = req.body.userId || req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`[API] Building soul signature for user: ${userId}`);

    const result = await soulSignatureBuilder.buildSoulSignature(userId);

    res.json(result);
  } catch (error) {
    console.error('[API] Error in /build-soul-signature:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/soul-data/soul-signature
 * Get user's soul signature
 */
router.get('/soul-signature', async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const { data, error } = await supabase
      .from('soul_signature_profile')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Handle "no rows" error separately from actual errors
    if (error) {
      // PGRST116 = Row not found (not an error, just no data yet)
      if (error.code === 'PGRST116' || error.message?.includes('0 rows')) {
        return res.status(200).json({
          success: false,
          error: 'Soul signature not found. Please extract data from platforms first.',
          soulSignature: null
        });
      }

      // Actual database error
      console.error('[API] Database error in /soul-signature:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch soul signature',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }

    if (!data) {
      return res.status(200).json({
        success: false,
        error: 'Soul signature not found. Please extract data from platforms first.',
        soulSignature: null
      });
    }

    res.json({
      success: true,
      soulSignature: data
    });
  } catch (error) {
    console.error('[API] Unexpected error in /soul-signature:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch soul signature',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/soul-data/debug-env
 * Debug endpoint to check environment variable status
 */
router.get('/debug-env', (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const allEnvKeys = Object.keys(process.env).filter(key =>
    key.includes('ANTHROPIC') || key.includes('API') || key.includes('CLAUDE')
  );
  res.json({
    hasKey: !!apiKey,
    keyLength: apiKey?.length,
    keyPrefix: apiKey?.substring(0, 15),
    keySuffix: apiKey?.substring(apiKey.length - 10),
    hasWhitespace: /\s/.test(apiKey),
    environment: process.env.NODE_ENV || 'production',
    relatedEnvVars: allEnvKeys
  });
});



/**
 * POST /api/soul-data/trigger-extraction
 * Manually trigger data extraction for all connected platforms
 */
router.post('/trigger-extraction', async (req, res) => {
  try {
    const userId = req.body.userId || req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`[API] Manual extraction triggered for user: ${userId}`);

    // Import extraction service
    const { default: extractionService } = await import('../services/dataExtractionService.js');
    
    // Trigger extraction for all platforms
    const result = await extractionService.extractAllPlatforms(userId);

    res.json({
      success: true,
      message: 'Data extraction started for all connected platforms',
      ...result
    });

  } catch (error) {
    console.error('[API] Error in /trigger-extraction:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger extraction',
      message: error.message
    });
  }
});

/**
 * GET /api/soul-data/check-extracted-data
 * Check if user has any extracted data to enable chat functionality
 */
router.get('/check-extracted-data', async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`[API] Checking for existing extracted data for user: ${userId}`);

    // Check if user has any data in user_platform_data table
    const { data, error } = await supabase
      .from('user_platform_data')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (error) {
      console.error('[API] Error checking for extracted data:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to check for existing data'
      });
    }

    const hasData = data && data.length > 0;

    console.log(`[API] User ${userId} has extracted data: ${hasData}`);

    res.json({
      success: true,
      hasData,
      dataCount: data?.length || 0
    });
  } catch (error) {
    console.error('[API] Error in /check-extracted-data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check for extracted data',
      message: error.message
    });
  }
});

export default router;
