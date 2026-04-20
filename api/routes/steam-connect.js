/**
 * Steam Connect Routes
 * ====================
 * Steam Web API uses API keys + a user-provided Steam ID (or vanity URL).
 * This is NOT OAuth — the user provides their Steam profile URL or 64-bit ID.
 * Profile must be public for the API to return data.
 *
 * POST   /api/steam/connect    — resolve + validate + save steamId to platform_connections
 * POST   /api/steam/disconnect — remove connection
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('SteamConnect');

const router = express.Router();

const STEAM_API_BASE = 'https://api.steampowered.com';

/**
 * Parse the user's input and return either a 64-bit Steam ID or a vanity name
 * to resolve. Supports:
 *  - Raw 17-digit steamid64:           "76561198000000000"
 *  - Profile URL with steamid64:        "steamcommunity.com/profiles/765611..."
 *  - Vanity URL:                        "steamcommunity.com/id/gabelogannewell/"
 *  - Bare vanity name:                  "gabelogannewell"
 */
function parseSteamInput(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { error: 'Steam profile URL or ID is required' };

  // Raw 17-digit steamid64
  if (/^\d{17}$/.test(trimmed)) {
    return { steamId: trimmed };
  }

  // Strip protocol + trailing slash
  const stripped = trimmed.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

  // steamcommunity.com/profiles/<steamid64>
  const profileMatch = stripped.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (profileMatch) return { steamId: profileMatch[1] };

  // steamcommunity.com/id/<vanity>
  const vanityMatch = stripped.match(/steamcommunity\.com\/id\/([A-Za-z0-9_-]+)/i);
  if (vanityMatch) return { vanity: vanityMatch[1] };

  // Bare vanity-ish string (no spaces, reasonable length)
  if (/^[A-Za-z0-9_-]{2,32}$/.test(trimmed)) {
    return { vanity: trimmed };
  }

  return { error: 'Could not parse Steam input. Provide a profile URL or 64-bit Steam ID.' };
}

async function resolveVanity(apiKey, vanity) {
  const url = `${STEAM_API_BASE}/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(apiKey)}&vanityurl=${encodeURIComponent(vanity)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam vanity resolve failed: ${res.status}`);
  const json = await res.json();
  const success = json?.response?.success;
  if (success === 1 && json.response.steamid) {
    return json.response.steamid;
  }
  return null;
}

async function fetchPlayerSummary(apiKey, steamId) {
  const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(apiKey)}&steamids=${encodeURIComponent(steamId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam profile fetch failed: ${res.status}`);
  const json = await res.json();
  const players = json?.response?.players;
  if (!Array.isArray(players) || players.length === 0) return null;
  return players[0];
}

// ─── POST /connect ─────────────────────────────────────────────────────────────

router.post('/connect', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const apiKey = process.env.STEAM_WEB_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error: 'Steam integration not configured',
      message: 'STEAM_WEB_API_KEY is missing on the server. Get a key at https://steamcommunity.com/dev/apikey',
    });
  }

  const { steamInput } = req.body || {};
  const parsed = parseSteamInput(steamInput);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  try {
    let steamId = parsed.steamId;

    if (!steamId && parsed.vanity) {
      steamId = await resolveVanity(apiKey, parsed.vanity);
      if (!steamId) {
        return res.status(404).json({
          error: 'Could not find that Steam profile. Check the URL or use your 64-bit Steam ID.',
        });
      }
    }

    const summary = await fetchPlayerSummary(apiKey, steamId);
    if (!summary) {
      return res.status(404).json({
        error: 'Steam profile not found or is private. Make your profile public and try again.',
      });
    }

    const personaName = summary.personaname || null;

    // Upsert connection — no access_token (not OAuth), keep steamId in metadata
    const { error } = await supabaseAdmin
      .from('platform_connections')
      .upsert({
        user_id: userId,
        platform: 'steam',
        access_token: null,
        refresh_token: null,
        connected_at: new Date().toISOString(),
        status: 'active',
        metadata: {
          steamId,
          personaName,
          profileUrl: summary.profileurl || null,
          avatar: summary.avatarfull || summary.avatar || null,
          countryCode: summary.loccountrycode || null,
          timeCreated: summary.timecreated || null,
        },
      }, { onConflict: 'user_id,platform' });

    if (error) throw error;

    // Trigger immediate extraction (non-blocking)
    import('../services/extractors/steamExtractor.js').then(({ extractAll }) => {
      extractAll(userId, null).catch(err =>
        log.warn('Initial Steam extraction failed:', err.message)
      );
    }).catch(() => {});

    return res.json({ success: true, steamId, personaName });
  } catch (err) {
    log.error('Steam connect error:', err.message);
    return res.status(500).json({ error: 'Failed to connect Steam', message: err.message });
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
      .eq('platform', 'steam');
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    log.error('Steam disconnect error:', err.message);
    return res.status(500).json({ error: 'Failed to disconnect Steam' });
  }
});

export default router;
