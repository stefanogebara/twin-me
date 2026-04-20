/**
 * Duolingo Connect Routes
 * =======================
 * Duolingo has no OAuth. Its unofficial public profile endpoint accepts a
 * username and returns courses, streak, XP, etc. The profile must be public
 * (the default for most accounts).
 *
 * POST /api/duolingo/connect    — validate username via Duolingo API, save to metadata
 * POST /api/duolingo/disconnect — remove connection
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('DuolingoConnect');

const router = express.Router();

const DUOLINGO_API_BASE = 'https://www.duolingo.com';

/**
 * Parse user input — accept a bare username or a profile URL.
 * duolingo.com/profile/{username}
 */
function parseUsernameInput(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { error: 'Duolingo username is required' };

  const stripped = trimmed.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const profileMatch = stripped.match(/duolingo\.com\/profile\/([A-Za-z0-9_-]+)/i);
  if (profileMatch) return { username: profileMatch[1] };

  if (/^[A-Za-z0-9_-]{1,64}$/.test(trimmed)) return { username: trimmed };

  return { error: 'Could not parse Duolingo input. Provide your username or profile URL.' };
}

async function fetchDuolingoProfile(username) {
  const url = `${DUOLINGO_API_BASE}/2017-06-30/users?username=${encodeURIComponent(username)}`;
  const res = await fetch(url, {
    headers: {
      // Duolingo returns JSON regardless of UA, but set a polite UA.
      'User-Agent': 'TwinMe/1.0 (+https://twinme.app)',
      Accept: 'application/json',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Duolingo API returned ${res.status}`);
  const json = await res.json();
  // Endpoint returns { users: [...] }
  const users = Array.isArray(json?.users) ? json.users : [];
  if (users.length === 0) return null;
  return users[0];
}

// ─── POST /connect ─────────────────────────────────────────────────────────────

router.post('/connect', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { username: rawUsername } = req.body || {};
  const parsed = parseUsernameInput(rawUsername);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  try {
    const profile = await fetchDuolingoProfile(parsed.username);
    if (!profile) {
      return res.status(404).json({
        error: 'Duolingo profile not found. Check the username at duolingo.com/profile/{username}.',
      });
    }

    const { error } = await supabaseAdmin
      .from('platform_connections')
      .upsert({
        user_id: userId,
        platform: 'duolingo',
        access_token: null,
        refresh_token: null,
        connected_at: new Date().toISOString(),
        status: 'active',
        metadata: {
          duolingoUsername: profile.username || parsed.username,
          name: profile.name || null,
          streak: profile.streak || 0,
          totalXp: profile.totalXp || 0,
          currentCourseId: profile.currentCourseId || null,
          plusStatus: Boolean(profile.hasPlus || profile.plusStatus),
        },
      }, { onConflict: 'user_id,platform' });

    if (error) throw error;

    // Fire-and-forget extraction
    import('../services/extractors/duolingoExtractor.js').then(({ extractAll }) => {
      extractAll(userId, null).catch(err =>
        log.warn('Initial Duolingo extraction failed:', err.message)
      );
    }).catch(() => {});

    return res.json({
      success: true,
      username: profile.username || parsed.username,
      streak: profile.streak || 0,
      totalXp: profile.totalXp || 0,
    });
  } catch (err) {
    log.error('Duolingo connect error:', err.message);
    return res.status(500).json({ error: 'Failed to connect Duolingo', ...(process.env.NODE_ENV !== 'production' && { message: err.message }) });
  }
});

// ─── POST /disconnect ──────────────────────────────────────────────────────────

router.post('/disconnect', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  try {
    const { error } = await supabaseAdmin
      .from('platform_connections')
      .delete()
      .eq('user_id', userId)
      .eq('platform', 'duolingo');
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    log.error('Duolingo disconnect error:', err.message);
    return res.status(500).json({ error: 'Failed to disconnect Duolingo' });
  }
});

export default router;
