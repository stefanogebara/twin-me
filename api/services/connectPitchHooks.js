/**
 * Connect Pitch Hooks
 * ===================
 * Generates short, personalized one-liners for unconnected platform tiles on /connect.
 * Rule-based only — NO LLM (page load cost must be trivial).
 *
 * Heuristics use:
 *   - which platforms the user has already connected (platform_connections table)
 *   - simple counts/signals from recent user_memories rows
 *
 * Contract:
 *   getPitchHooks(userId) -> { [platformId]: string | null }
 * Platforms without a personalized hook are simply absent (or null) — the
 * frontend falls back to the generic description.
 */

import { supabaseAdmin } from './database.js';
import { createLogger } from './logger.js';

const log = createLogger('ConnectPitchHooks');

// Platforms we have hooks for. Add new rules sparingly.
const SUPPORTED_PLATFORMS = ['strava', 'outlook', 'pinterest', 'notion', 'apple_health', 'linkedin'];

/**
 * Build the hook map for a given user.
 * @param {string} userId  public.users.id
 * @returns {Promise<Record<string, string|null>>}
 */
export async function getPitchHooks(userId) {
  if (!userId) return {};

  try {
    // Fetch connected platforms (single query)
    const { data: connections } = await supabaseAdmin
      .from('platform_connections')
      .select('platform, status')
      .eq('user_id', userId);

    const connectedSet = new Set(
      (connections || [])
        .filter(c => c.status === 'connected' || c.status === 'active' || !c.status)
        .map(c => c.platform)
    );

    // Pull a slim slice of recent platform_data observations for heuristics.
    // Reflections dominate recent memories — scan 300 to find a handful of data points.
    const { data: recentMemories } = await supabaseAdmin
      .from('user_memories')
      .select('memory_type, content, platform_data, created_at')
      .eq('user_id', userId)
      .in('memory_type', ['platform_data', 'observation'])
      .order('created_at', { ascending: false })
      .limit(300);

    const memories = recentMemories || [];

    const hooks = {};
    for (const platform of SUPPORTED_PLATFORMS) {
      if (connectedSet.has(platform)) continue; // only unconnected
      const hook = buildHookFor(platform, connectedSet, memories);
      if (hook) hooks[platform] = hook;
    }
    return hooks;
  } catch (err) {
    log.error('getPitchHooks error:', err.message);
    return {};
  }
}

// ── Rules ─────────────────────────────────────────────────────────────

function buildHookFor(platform, connected, memories) {
  switch (platform) {
    case 'strava':
      return stravaHook(connected, memories);
    case 'outlook':
      return outlookHook(connected, memories);
    case 'pinterest':
      return pinterestHook(connected, memories);
    case 'notion':
      return notionHook(connected, memories);
    case 'apple_health':
      return appleHealthHook(connected, memories);
    case 'linkedin':
      return linkedinHook(connected, memories);
    default:
      return null;
  }
}

function stravaHook(connected, memories) {
  if (!connected.has('whoop')) return null;
  // Look for recent low-recovery signals in Whoop data
  const redDays = memories.filter(m => {
    const hay = `${m.content || ''} ${JSON.stringify(m.platform_data || {})}`.toLowerCase();
    return hay.includes('recovery') && (hay.includes('red') || hay.includes('low recovery'));
  }).length;
  if (redDays >= 2) {
    return 'Your Whoop shows repeated low-recovery days — Strava would help diagnose training load.';
  }
  return 'Your Whoop recovery data pairs with Strava workouts to reveal what actually drains you.';
}

function outlookHook(connected, memories) {
  if (!connected.has('google_gmail') && !connected.has('gmail')) return null;
  // Rough email volume heuristic
  const emailMentions = memories.filter(m => {
    const hay = `${m.content || ''}`.toLowerCase();
    return hay.includes('email') || hay.includes('gmail') || hay.includes('inbox');
  }).length;
  if (emailMentions >= 5) {
    return 'Gmail shows a heavy sending pattern — Outlook would reveal whether your work inbox follows the same rhythm.';
  }
  return 'You already share your personal email patterns — Outlook would connect the work side.';
}

function pinterestHook(connected, memories) {
  if (!connected.has('spotify')) return null;
  // Diverse music taste heuristic: look for 3+ distinct genre-like tokens
  const text = memories.map(m => (m.content || '').toLowerCase()).join(' ');
  const genreTokens = ['funk', 'latin', 'indie', 'electronic', 'hip hop', 'jazz', 'pop', 'rock', 'classical', 'reggaeton', 'bossa'];
  const distinct = genreTokens.filter(g => text.includes(g)).length;
  if (distinct >= 3) {
    return 'Your Spotify taste spans multiple moods — Pinterest boards would reveal the visual aesthetic matching those shifts.';
  }
  return null;
}

function notionHook(connected, memories) {
  if (!connected.has('google_calendar') && !connected.has('calendar')) return null;
  const meetingHeavy = memories.filter(m => {
    const hay = `${m.content || ''}`.toLowerCase();
    return hay.includes('meeting') || hay.includes('calendar');
  }).length;
  if (meetingHeavy >= 8) {
    return 'Your calendar shows a packed meeting schedule — Notion would reveal what you actually think between the meetings.';
  }
  return null;
}

function appleHealthHook(connected, memories) {
  if (connected.has('whoop') || connected.has('garmin')) return null; // already covered
  // Only useful signal when nothing health-related is connected
  return null;
}

function linkedinHook(connected, memories) {
  if (connected.has('github')) {
    return 'Your GitHub shows what you build — LinkedIn would add the trajectory behind it.';
  }
  return null;
}
