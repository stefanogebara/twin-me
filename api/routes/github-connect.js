/**
 * GitHub Connect Routes
 * =====================
 * Stores a user's GitHub Personal Access Token (PAT) so the background
 * ingestion can pull commit/PR/issue events from the GitHub API.
 *
 * PAT permissions needed: read:user, repo (read-only is enough)
 *
 * GET  /api/github/status     — check if connected + last sync time
 * POST /api/github/connect    — save PAT + username
 * DELETE /api/github/connect  — disconnect (delete token)
 */

import express from 'express';
import axios from 'axios';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('GitHubConnect');

const router = express.Router();

// ─── GET /status ──────────────────────────────────────────────────────────────

router.get('/status', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  try {
    const { data, error } = await supabaseAdmin
      .from('user_github_config')
      .select('github_username, connected_at, last_synced_at, scopes')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.json({ connected: false });
    }

    return res.json({
      connected: true,
      github_username: data.github_username,
      connected_at: data.connected_at,
      last_synced_at: data.last_synced_at,
      scopes: data.scopes,
    });
  } catch (err) {
    log.error('Status error:', err.message);
    res.status(500).json({ error: 'Failed to get GitHub status' });
  }
});

// ─── POST /connect ─────────────────────────────────────────────────────────────

router.post('/connect', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { access_token } = req.body;

  if (!access_token || typeof access_token !== 'string' || access_token.length < 10) {
    return res.status(400).json({ error: 'access_token is required' });
  }

  // Validate the token by calling GitHub API
  let githubUsername;
  let scopes;
  try {
    const userRes = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `token ${access_token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'TwinMe/1.0',
      },
      timeout: 10000,
    });
    githubUsername = userRes.data?.login;
    scopes = userRes.headers['x-oauth-scopes'] || '';
    if (!githubUsername) throw new Error('No username returned from GitHub');
  } catch (err) {
    return res.status(400).json({
      error: 'Invalid GitHub token',
      message: err.response?.status === 401
        ? 'Token is invalid or expired. Generate a new one at github.com/settings/tokens'
        : 'Failed to validate GitHub token',
    });
  }

  // Upsert config
  try {
    const { error } = await supabaseAdmin
      .from('user_github_config')
      .upsert({
        user_id: userId,
        github_username: githubUsername,
        access_token,
        scopes,
        connected_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) throw error;

    // Trigger immediate ingestion (non-blocking)
    import('../services/observationFetchers/github.js').then(({ fetchGitHubObservations }) => {
      fetchGitHubObservations(userId).catch(err =>
        log.warn('Initial ingestion failed:', err.message)
      );
    }).catch(() => {});

    return res.json({
      success: true,
      github_username: githubUsername,
      scopes,
    });
  } catch (err) {
    log.error('Connect error:', err.message);
    res.status(500).json({ error: 'Failed to save GitHub config' });
  }
});

// ─── DELETE /connect ───────────────────────────────────────────────────────────

router.delete('/connect', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  try {
    const { error } = await supabaseAdmin
      .from('user_github_config')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    log.error('Disconnect error:', err.message);
    res.status(500).json({ error: 'Failed to disconnect GitHub' });
  }
});

export default router;
