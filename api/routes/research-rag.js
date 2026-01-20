/**
 * Research RAG API Routes
 * Endpoints for managing and querying research paper embeddings
 */

import express from 'express';
import researchRAGService from '../services/researchRAGService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/research-rag/status
 * Get the status of indexed research papers
 */
router.get('/status', async (req, res) => {
  try {
    const status = await researchRAGService.getIndexStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    console.error('[Research RAG] Error getting status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/research-rag/index
 * Index all research papers with embeddings
 */
router.post('/index', async (req, res) => {
  try {
    console.log('[Research RAG] Starting indexing...');
    const result = await researchRAGService.indexResearchPapers();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Research RAG] Error indexing:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/research-rag/search
 * Search for relevant research papers
 * Body: { query: string, limit?: number, threshold?: number }
 */
router.post('/search', async (req, res) => {
  try {
    const { query, limit = 5, threshold = 0.3 } = req.body;

    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    const results = await researchRAGService.searchResearch(query, limit, threshold);

    res.json({
      success: true,
      query,
      results,
      count: results.length
    });
  } catch (error) {
    console.error('[Research RAG] Error searching:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/research-rag/context/:dimension/:feature
 * Get research context for a specific personality dimension and feature
 */
router.get('/context/:dimension/:feature', async (req, res) => {
  try {
    const { dimension, feature } = req.params;

    const context = await researchRAGService.getResearchContext(dimension, feature);

    res.json({
      success: true,
      dimension,
      feature,
      ...context
    });
  } catch (error) {
    console.error('[Research RAG] Error getting context:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
