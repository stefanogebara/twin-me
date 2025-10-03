/**
 * Soul Data API Routes
 * Endpoints for data extraction, processing, and RAG-powered chat
 */

const express = require('express');
const router = express.Router();

const dataExtractionService = require('../services/dataExtractionService');
const textProcessor = require('../services/textProcessor');
const stylometricAnalyzer = require('../services/stylometricAnalyzer');
const embeddingGenerator = require('../services/embeddingGenerator');
const ragService = require('../services/ragService');

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

    const validPlatforms = ['github', 'discord', 'linkedin'];
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

    const result = await stylometricAnalyzer.analyzeUserStyle(userId);

    res.json(result);
  } catch (error) {
    console.error('[API] Error in /analyze-style:', error);
    res.status(500).json({
      success: false,
      error: error.message
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

    console.log(`[API] RAG chat request from user: ${userId}`);

    const result = await ragService.chat(
      userId,
      twinId || null,
      message,
      conversationHistory || []
    );

    res.json(result);
  } catch (error) {
    console.error('[API] Error in /rag/chat:', error);
    res.status(500).json({
      success: false,
      error: error.message
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

module.exports = router;
