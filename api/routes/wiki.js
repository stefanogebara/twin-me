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
import { getWikiPages, getWikiPage, getWikiLogs, compileWikiPages, buildWikiGraphData, detectWikiLints } from '../services/wikiCompilationService.js';
import { supabaseAdmin } from '../services/database.js';
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
 * GET /api/wiki/graph
 * Returns full knowledge graph data: domain nodes + platform nodes + entity nodes + all edges.
 * Used by the WikiGraphPage frontend component.
 */
router.get('/graph', async (req, res) => {
  try {
    const userId = req.user.id;

    // Get connected platforms for this user (platform_connections is the primary source)
    let connectedPlatforms = [];
    try {
      const { data: connections } = await supabaseAdmin
        .from('platform_connections')
        .select('platform')
        .eq('user_id', userId)
        .eq('status', 'connected');
      connectedPlatforms = (connections || []).map(c => c.platform);
    } catch {
      // Non-fatal -- graph still works without platform nodes
    }

    const graphData = await buildWikiGraphData(userId, connectedPlatforms);
    res.json({ success: true, data: graphData });
  } catch (error) {
    log.error('Failed to build graph data', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/wiki/lint
 * Run wiki lint on-demand and return findings.
 */
router.get('/lint', async (req, res) => {
  try {
    const userId = req.user.id;
    log.info('Wiki lint requested', { userId });
    const result = await detectWikiLints(userId);
    res.json({ success: true, data: result });
  } catch (error) {
    log.error('Wiki lint failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/wiki/compile
 * Manually trigger wiki compilation (for testing/debug).
 * Rate limited: 20-minute persistent cooldown per user.
 *
 * audit-2026-05-24 H1: the previous in-memory `Map` cooldown emptied on
 * every Vercel cold start, so the 20-min budget was unenforceable in prod.
 * Each compile fires 5 TIER_ANALYSIS LLM calls — a determined caller could
 * burn $1–5/min unchecked. Persisted via user_platform_data with
 * data_type='wiki_compile_cooldown' (same pattern as the goals suggestion
 * cooldown in goalTrackingService.js).
 */
const COMPILE_COOLDOWN_MS = 20 * 60 * 1000;

async function getLastWikiCompileAt(userId) {
  const { data } = await supabaseAdmin
    .from('user_platform_data')
    .select('extracted_at')
    .eq('user_id', userId)
    .eq('platform', 'twinme')
    .eq('data_type', 'wiki_compile_cooldown')
    .order('extracted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.extracted_at ? new Date(data.extracted_at).getTime() : 0;
}

async function setLastWikiCompileAt(userId) {
  const { error } = await supabaseAdmin
    .from('user_platform_data')
    .insert({
      user_id: userId,
      platform: 'twinme',
      data_type: 'wiki_compile_cooldown',
      raw_data: { source: 'POST /api/wiki/compile' },
      extracted_at: new Date().toISOString(),
      processed: true,
    });
  if (error) log.warn('setLastWikiCompileAt failed', { error: error.message });
}

router.post('/compile', async (req, res) => {
  try {
    const userId = req.user.id;

    const lastCompile = await getLastWikiCompileAt(userId);
    if (lastCompile && Date.now() - lastCompile < COMPILE_COOLDOWN_MS) {
      const remainingMs = COMPILE_COOLDOWN_MS - (Date.now() - lastCompile);
      const remainingMin = Math.ceil(remainingMs / 60000);
      return res.status(429).json({
        success: false,
        error: `Compilation rate limited. Try again in ${remainingMin} minutes.`,
      });
    }

    // Stamp the cooldown BEFORE running compile so concurrent retries during
    // the long-running LLM batch (~25-50s) hit the rate limit too.
    await setLastWikiCompileAt(userId);
    log.info('Manual wiki compilation triggered', { userId });

    const result = await compileWikiPages(userId);
    res.json({ success: true, data: result });
  } catch (error) {
    log.error('Manual wiki compilation failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
