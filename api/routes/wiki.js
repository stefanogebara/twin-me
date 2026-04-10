/**
 * Wiki API Routes
 * ===============
 * Exposes user's compiled wiki pages and compilation logs.
 *
 * GET /api/wiki/pages          - All 5 domain pages
 * GET /api/wiki/pages/:domain  - Single domain page
 * GET /api/wiki/logs           - Compilation change log
 * POST /api/wiki/compile       - Manual compilation trigger (debug)
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { getWikiPages, getWikiPage, getWikiLogs, compileWikiPages } from '../services/wikiCompilationService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('WikiRoute');
const router = Router();

// All routes require authentication
router.use(authenticateUser);

/**
 * GET /api/wiki/pages
 * Returns all wiki pages for the authenticated user.
 */
router.get('/pages', async (req, res) => {
  try {
    const userId = req.user.id;
    const pages = await getWikiPages(userId);
    res.json({ success: true, data: pages });
  } catch (error) {
    log.error('Failed to fetch wiki pages', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/wiki/pages/:domain
 * Returns a single wiki page by domain.
 * Valid domains: personality, lifestyle, cultural, social, motivation
 */
router.get('/pages/:domain', async (req, res) => {
  try {
    const userId = req.user.id;
    const { domain } = req.params;

    const validDomains = ['personality', 'lifestyle', 'cultural', 'social', 'motivation'];
    if (!validDomains.includes(domain)) {
      return res.status(400).json({
        success: false,
        error: `Invalid domain. Must be one of: ${validDomains.join(', ')}`,
      });
    }

    const page = await getWikiPage(userId, domain);
    if (!page) {
      return res.status(404).json({
        success: false,
        error: `No wiki page found for domain: ${domain}`,
      });
    }

    res.json({ success: true, data: page });
  } catch (error) {
    log.error('Failed to fetch wiki page', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/wiki/logs
 * Returns compilation change log for the authenticated user.
 * Query params: limit (default 20, max 100)
 */
router.get('/logs', async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const logs = await getWikiLogs(userId, limit);
    res.json({ success: true, data: logs });
  } catch (error) {
    log.error('Failed to fetch wiki logs', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/wiki/compile
 * Manually trigger wiki compilation (for testing/debug).
 * Rate limited: max 3 compiles per hour per user.
 */
const compileCooldowns = new Map(); // userId -> lastCompileTimestamp
const COMPILE_COOLDOWN_MS = 20 * 60 * 1000; // 20 minutes between manual compiles

router.post('/compile', async (req, res) => {
  try {
    const userId = req.user.id;

    // Rate limit: prevent spam
    const lastCompile = compileCooldowns.get(userId);
    if (lastCompile && Date.now() - lastCompile < COMPILE_COOLDOWN_MS) {
      const remainingMs = COMPILE_COOLDOWN_MS - (Date.now() - lastCompile);
      const remainingMin = Math.ceil(remainingMs / 60000);
      return res.status(429).json({
        success: false,
        error: `Compilation rate limited. Try again in ${remainingMin} minutes.`,
      });
    }

    compileCooldowns.set(userId, Date.now());
    log.info('Manual wiki compilation triggered', { userId });

    const result = await compileWikiPages(userId);
    res.json({ success: true, data: result });
  } catch (error) {
    log.error('Manual wiki compilation failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
