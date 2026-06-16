/**
 * Extended Tools — Non-Workspace Agentic Actions
 * ================================================
 * Registers tools beyond Google Workspace: web search, GitHub, Spotify,
 * and the Meeting Prep tool. These integrate into the twin chat action parser
 * alongside Google Workspace tools.
 */

import { registerTool } from '../toolRegistry.js';
import { createLogger } from '../logger.js';

const log = createLogger('ExtendedTools');

export const EXTENDED_TOOL_NAMES = [
  'web_search',
  'github_list_prs',
  'github_search_issues',
  'spotify_search',
  'spotify_queue',
  'spotify_play_track',
  'meeting_prep',
  'get_meeting_prep',
  'get_recurring_subscriptions',
  'simulate_future',
  'set_reminder',
];

export function registerExtendedTools() {
  // ========================================================================
  // WEB SEARCH — Real-time web lookup (Level 1)
  // ========================================================================

  registerTool({
    name: 'web_search',
    platform: null,
    description: 'Search the web for real-time information — news, company info, person background, current events.',
    category: 'research',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        count: { type: 'number', description: 'Number of results (default 5, max 10)' },
      },
      required: ['query'],
    },
    requiresConnection: false,
    minAutonomyLevel: 1,
    skillName: 'web_research',
    executor: async (_userId, params) => {
      const { webSearch } = await import('../webSearchService.js');
      return webSearch(params.query, { count: Math.min(params.count || 5, 10) });
    },
  });

  // ========================================================================
  // GITHUB — Read-only (Level 1)
  // ========================================================================

  registerTool({
    name: 'github_list_prs',
    platform: 'github',
    description: 'List open pull requests authored by the user across their repositories.',
    category: 'development',
    parameters: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Optional: filter by repo (e.g. "owner/repo")' },
        state: { type: 'string', description: 'PR state: open (default), closed, merged' },
      },
    },
    requiresConnection: true,
    minAutonomyLevel: 1,
    skillName: 'github_actions',
    executor: async (userId, params) => {
      const { getValidAccessToken } = await import('../tokenRefreshService.js');
      const tokenResult = await getValidAccessToken(userId, 'github');
      if (!tokenResult.success) return { success: false, error: 'GitHub not connected' };

      const state = params.state || 'open';
      const repoFilter = params.repo ? `+repo:${params.repo}` : '';
      const q = `is:pr+is:${state}+author:@me${repoFilter}`;

      const res = await fetch(`https://api.github.com/search/issues?q=${q}&per_page=10`, {
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          Accept: 'application/vnd.github+json',
        },
      });
      if (!res.ok) return { success: false, error: `GitHub API error: ${res.status}` };

      const data = await res.json();
      const prs = (data.items || []).map(pr => ({
        number: pr.number,
        title: pr.title,
        repo: pr.repository_url?.split('/').slice(-2).join('/') || '',
        state: pr.state,
        url: pr.html_url,
        updatedAt: pr.updated_at,
        draft: pr.draft,
      }));
      return { success: true, count: prs.length, prs };
    },
  });

  registerTool({
    name: 'github_search_issues',
    platform: 'github',
    description: 'Search GitHub issues assigned to or created by the user.',
    category: 'development',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms (e.g. "bug login")' },
        repo: { type: 'string', description: 'Optional: filter by repo (e.g. "owner/repo")' },
      },
      required: ['query'],
    },
    requiresConnection: true,
    minAutonomyLevel: 1,
    skillName: 'github_actions',
    executor: async (userId, params) => {
      const { getValidAccessToken } = await import('../tokenRefreshService.js');
      const tokenResult = await getValidAccessToken(userId, 'github');
      if (!tokenResult.success) return { success: false, error: 'GitHub not connected' };

      const repoFilter = params.repo ? `+repo:${params.repo}` : '';
      const q = `${encodeURIComponent(params.query)}+is:issue+is:open+author:@me${repoFilter}`;

      const res = await fetch(`https://api.github.com/search/issues?q=${q}&per_page=10`, {
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          Accept: 'application/vnd.github+json',
        },
      });
      if (!res.ok) return { success: false, error: `GitHub API error: ${res.status}` };

      const data = await res.json();
      const issues = (data.items || []).map(i => ({
        number: i.number,
        title: i.title,
        repo: i.repository_url?.split('/').slice(-2).join('/') || '',
        labels: i.labels?.map(l => l.name) || [],
        url: i.html_url,
        updatedAt: i.updated_at,
      }));
      return { success: true, count: issues.length, issues };
    },
  });

  // ========================================================================
  // SPOTIFY — Read (Level 1)
  // ========================================================================

  registerTool({
    name: 'spotify_search',
    platform: 'spotify',
    description: 'Search Spotify for a track, album, or playlist and return the top results with their URIs. ALWAYS call this BEFORE spotify_queue or spotify_play_track to resolve a song name into the real Spotify URI — never invent URIs.',
    category: 'music',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query, e.g. "Bohemian Rhapsody Queen"' },
        type: { type: 'string', description: 'Optional: "track" (default), "album", or "playlist"' },
        limit: { type: 'number', description: 'Optional: max results, default 5, max 10' },
      },
      required: ['query'],
    },
    requiresConnection: true,
    minAutonomyLevel: 1,
    skillName: 'spotify_actions',
    executor: async (userId, params) => {
      const { getValidAccessToken } = await import('../tokenRefreshService.js');
      const tokenResult = await getValidAccessToken(userId, 'spotify');
      if (!tokenResult.success) return { success: false, error: 'Spotify not connected' };

      const type = (params.type || 'track').toLowerCase();
      if (!['track', 'album', 'playlist'].includes(type)) {
        return { success: false, error: `Invalid type: ${type}. Use track, album, or playlist.` };
      }
      const limit = Math.min(Math.max(parseInt(params.limit, 10) || 5, 1), 10);

      const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(params.query)}&type=${type}&limit=${limit}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
      });
      if (!res.ok) return { success: false, error: `Spotify API error: ${res.status}` };

      const data = await res.json();
      const bucket = data[`${type}s`]?.items || [];
      const results = bucket.map(item => ({
        uri: item.uri,
        name: item.name,
        artists: (item.artists || []).map(a => a.name).join(', ') || null,
        album: item.album?.name || null,
        durationMs: item.duration_ms ?? null,
        externalUrl: item.external_urls?.spotify || null,
      }));
      return { success: true, type, count: results.length, results };
    },
  });

  // ========================================================================
  // SPOTIFY — Write (Level 2 — requires confirmation)
  // ========================================================================

  registerTool({
    name: 'spotify_queue',
    platform: 'spotify',
    description: 'Add a track or playlist to the Spotify queue.',
    category: 'music',
    parameters: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Spotify URI (e.g. "spotify:track:4cOdK2wGLETKBW3PvgPWqT")' },
      },
      required: ['uri'],
    },
    requiresConnection: true,
    minAutonomyLevel: 2,
    skillName: 'spotify_actions',
    executor: async (userId, params) => {
      const { getValidAccessToken } = await import('../tokenRefreshService.js');
      const tokenResult = await getValidAccessToken(userId, 'spotify');
      if (!tokenResult.success) return { success: false, error: 'Spotify not connected' };

      const res = await fetch(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(params.uri)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
      });
      if (res.status === 404) return { success: false, error: 'no_active_device', message: 'No active Spotify device. Open Spotify first.' };
      if (!res.ok) return { success: false, error: `Spotify API error: ${res.status}` };
      return { success: true, uri: params.uri, action: 'queued' };
    },
  });

  registerTool({
    name: 'spotify_play_track',
    platform: 'spotify',
    description: 'Play a specific Spotify track or playlist URI immediately.',
    category: 'music',
    parameters: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Spotify URI (track, album, or playlist)' },
      },
      required: ['uri'],
    },
    requiresConnection: true,
    minAutonomyLevel: 2,
    skillName: 'spotify_actions',
    executor: async (userId, params) => {
      const { getValidAccessToken } = await import('../tokenRefreshService.js');
      const tokenResult = await getValidAccessToken(userId, 'spotify');
      if (!tokenResult.success) return { success: false, error: 'Spotify not connected' };

      const uri = params.uri;
      const body = uri.startsWith('spotify:track:')
        ? { uris: [uri] }
        : { context_uri: uri };

      const res = await fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${tokenResult.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 404) return { success: false, error: 'no_active_device', message: 'No active Spotify device. Open Spotify first.' };
      if (res.status === 204 || res.ok) return { success: true, uri, action: 'playing' };
      return { success: false, error: `Spotify API error: ${res.status}` };
    },
  });

  // ========================================================================
  // MEETING PREP — On-demand briefing (Level 1)
  // ========================================================================

  registerTool({
    name: 'meeting_prep',
    platform: null,
    description: 'Generate a FRESH pre-meeting briefing for ONE specific meeting: attendee background, company context, past touchpoints from memory, talking points, and watch-outs. Use this when the user asks to prep for a specific named meeting that may not be briefed yet.',
    category: 'productivity',
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'Google Calendar event ID (from [eventId:...] tags in context)' },
        summary: { type: 'string', description: 'Meeting title or description if eventId is unknown' },
      },
    },
    requiresConnection: false,
    minAutonomyLevel: 1,
    skillName: 'meeting_prep',
    executor: async (userId, params) => {
      const { generateBriefingForChat } = await import('../meetingPrep/meetingPrepService.js');
      return generateBriefingForChat(userId, params);
    },
  });

  // ========================================================================
  // GET MEETING PREP — Read already-generated briefings (Level 1)
  // ========================================================================
  registerTool({
    name: 'get_meeting_prep',
    platform: null,
    description: 'List the meeting briefings the twin has ALREADY prepared (from the meeting-prep cron + calendar scan). Use this when the user asks broadly — "what\'s my prep for tomorrow?", "what meetings do I have?", "am I ready for this week?". Returns upcoming + recently-ended meetings with their briefings. Does NOT regenerate — it reads what already exists, so it\'s fast. For prepping ONE specific un-briefed meeting, use meeting_prep instead.',
    category: 'productivity',
    parameters: {
      type: 'object',
      properties: {
        timeframe: {
          type: 'string',
          enum: ['upcoming', 'recent', 'all'],
          description: 'Which briefings to return. "upcoming" = meetings that haven\'t happened yet (default), "recent" = meetings that already ended, "all" = both.',
        },
      },
    },
    requiresConnection: false,
    minAutonomyLevel: 1,
    skillName: 'meeting_prep',
    executor: async (userId, params) => {
      const { listMeetingBriefingsForChat } = await import('../meetingPrep/meetingPrepService.js');
      return listMeetingBriefingsForChat(userId, params?.timeframe || 'upcoming');
    },
  });

  // ========================================================================
  // GET RECURRING SUBSCRIPTIONS — Subscription audit + emotional anchor
  // ========================================================================
  registerTool({
    name: 'get_recurring_subscriptions',
    platform: null,
    description: 'List the user\'s recurring subscriptions detected from their transactions (statement uploads, WhatsApp capture, purchase notifications). Use this when the user asks "what am I paying for?", "what subscriptions do I have?", "where is my money leaking?". Each subscription shows merchant, monthly average, last-charge date, total charges. ChatGPT Personal Finance shows a flat subscription list; this one also surfaces the emotional context AT THE FIRST CHARGE — useful for the "I signed up for this gym on a low-recovery weekend, never used it" insight.',
    category: 'finance',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max subscriptions to return. Default 15. Max 50.' },
        minMonthly: { type: 'number', description: 'Optional: only return subscriptions with monthly_avg >= this amount in the dominant currency. Default 0.' },
      },
    },
    requiresConnection: false,
    minAutonomyLevel: 1,
    skillName: 'finance',
    executor: async (userId, params) => {
      const { supabaseAdmin } = await import('../database.js');
      const limit = Math.min(Math.max(parseInt(String(params?.limit ?? '15'), 10) || 15, 1), 50);
      const minMonthly = Math.max(Number(params?.minMonthly) || 0, 0);

      // Pull all recurring rows + first-charge emotional context. Recurrence
      // is per-merchant in the detector, so we aggregate by merchant_normalized.
      const { data: rows, error } = await supabaseAdmin
        .from('user_transactions')
        .select(`
          id, amount, currency, merchant_normalized, merchant_raw, category,
          transaction_date, source_bank, account_type,
          emotional_context:transaction_emotional_context (
            recovery_score, computed_stress_score, calendar_load, music_valence
          )
        `)
        .eq('user_id', userId)
        .eq('is_recurring', true)
        .lt('amount', 0)
        .order('transaction_date', { ascending: false })
        .limit(2000);
      if (error) return { success: false, error: error.message };
      if (!rows?.length) {
        return { success: true, count: 0, subscriptions: [], message: 'No recurring subscriptions detected yet. Connect a bank or upload a statement to start tracking.' };
      }

      // Group by merchant_normalized
      const byMerchant = new Map();
      for (const r of rows) {
        const key = r.merchant_normalized || r.merchant_raw || 'unknown';
        if (!byMerchant.has(key)) byMerchant.set(key, []);
        byMerchant.get(key).push(r);
      }

      const subscriptions = [];
      for (const [merchant, txs] of byMerchant.entries()) {
        if (txs.length < 2) continue; // need >= 2 charges to confirm recurrence
        const sorted = [...txs].sort((a, b) => (a.transaction_date || '').localeCompare(b.transaction_date || ''));
        const firstCharge = sorted[0];
        const lastCharge = sorted[sorted.length - 1];
        const amounts = txs.map(t => Math.abs(Number(t.amount) || 0));
        const monthlyAvg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
        if (monthlyAvg < minMonthly) continue;
        const currency = firstCharge.currency || 'USD';
        const ec = firstCharge.emotional_context;
        const firstChargeContext = [];
        if (ec?.recovery_score != null) firstChargeContext.push(`Whoop recovery ${Math.round(ec.recovery_score)}%`);
        if (ec?.computed_stress_score != null && ec.computed_stress_score >= 0.5) firstChargeContext.push(`stress ${Math.round(ec.computed_stress_score * 100)}%`);
        if (ec?.calendar_load != null && ec.calendar_load >= 3) firstChargeContext.push(`${ec.calendar_load} meetings that day`);
        if (ec?.music_valence != null && ec.music_valence < 0.3) firstChargeContext.push('somber music');

        subscriptions.push({
          merchant,
          category: firstCharge.category || null,
          monthlyAvg: Math.round(monthlyAvg * 100) / 100,
          currency,
          chargeCount: txs.length,
          firstChargeDate: firstCharge.transaction_date,
          lastChargeDate: lastCharge.transaction_date,
          totalSpentToDate: Math.round(amounts.reduce((s, a) => s + a, 0) * 100) / 100,
          firstChargeContext: firstChargeContext.length ? firstChargeContext.join(' · ') : null,
          source: firstCharge.source_bank,
        });
      }

      // Sort by monthly avg desc — most expensive surfaces first
      subscriptions.sort((a, b) => b.monthlyAvg - a.monthlyAvg);
      const top = subscriptions.slice(0, limit);

      // Synthesis line — surface the moat angle when first-charge context is rich
      const stressfulSignups = subscriptions.filter(s => s.firstChargeContext && /stress|low recovery|somber/i.test(s.firstChargeContext));
      const totalMonthly = subscriptions.reduce((s, sub) => s + sub.monthlyAvg, 0);
      const totalMonthlyStr = subscriptions[0]
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: subscriptions[0].currency }).format(totalMonthly)
        : `$${totalMonthly.toFixed(2)}`;
      const synthesis = stressfulSignups.length >= 2
        ? `You're paying ${totalMonthlyStr}/month across ${subscriptions.length} subscriptions. ${stressfulSignups.length} were signed up on stressed/low-recovery days — worth a look.`
        : `You're paying ${totalMonthlyStr}/month across ${subscriptions.length} subscriptions.`;

      return {
        success: true,
        count: subscriptions.length,
        totalMonthly: Math.round(totalMonthly * 100) / 100,
        synthesis,
        subscriptions: top,
      };
    },
  });

  // ========================================================================
  // FUTURE SIMULATION — Doctor Strange mode (MiroFish-lite, Level 1)
  // ========================================================================
  // "What should my next month look like?" / "simulate my future" — runs N
  // parallel twin variations over the memory stream and reports the consensus.
  registerTool({
    name: 'simulate_future',
    platform: null,
    description:
      'Simulate the user\'s near future: run several independent variations of their next month ' +
      'grounded in their real behavioral patterns, then report the consensus recommendation. ' +
      'Use when the user asks what they should do next, what their month could look like, ' +
      'to "simulate/predict my future", or asks a WHAT-IF about a decision ' +
      '("what if I take the job?", "should I move to Lisbon?") — pass the decision as `scenario`.',
    category: 'insight',
    parameters: {
      type: 'object',
      properties: {
        horizonDays: { type: 'number', description: 'Days to simulate ahead (default 30, max 90)' },
        scenario: { type: 'string', description: 'Optional what-if: a decision to condition every simulation on, e.g. "taking the job in Lisbon"' },
      },
      required: [],
    },
    requiresConnection: false,
    minAutonomyLevel: 1,
    skillName: 'future_simulation',
    executor: async (userId, params) => {
      const { simulateFutures } = await import('../futureSimulationService.js');
      const result = await simulateFutures(userId, {
        horizonDays: Math.min(Math.max(params?.horizonDays || 30, 7), 90),
        scenario: params?.scenario ? String(params.scenario).slice(0, 200) : null,
      });
      if (!result) {
        return {
          success: false,
          error: 'Not enough memory data yet to simulate honestly — connect more platforms or keep chatting.',
        };
      }
      return { success: true, runs: result.runs, consensus: result.insight };
    },
  });

  // ========================================================================
  // REMINDERS — set a time-based nudge (Level 1: it's the user's own reminder,
  // no external side effect, so it executes inline rather than queuing).
  // ========================================================================

  registerTool({
    name: 'set_reminder',
    platform: null,
    description: 'Set a reminder for the user. Use their LOCAL time WITHOUT a Z suffix (e.g. "2026-06-17T09:00:00" for 9am tomorrow local) — the timezone is applied automatically. At that time the twin messages the user on their live channel (WhatsApp/Telegram). Use for "remind me to X", "me lembra de Y", "me cutuca amanhã".',
    category: 'productivity',
    parameters: {
      type: 'object',
      properties: {
        remind_at: { type: 'string', description: 'When to remind, LOCAL time ISO 8601 WITHOUT Z (e.g. "2026-06-17T09:00:00"). Do NOT append Z.' },
        message: { type: 'string', description: 'What to remind about, short and in the user\'s voice (e.g. "pagar o boleto", "ligar pro dentista").' },
      },
      required: ['remind_at', 'message'],
    },
    requiresConnection: false,
    minAutonomyLevel: 1,
    skillName: 'reminders',
    executor: async (userId, params) => {
      const { supabaseAdmin } = await import('../database.js');
      const { createReminder } = await import('../reminderService.js');
      let tz = 'UTC';
      try {
        const { data } = await supabaseAdmin.from('users').select('timezone').eq('id', userId).single();
        if (data?.timezone) tz = data.timezone;
      } catch { /* non-fatal — falls back to UTC */ }
      return createReminder(userId, {
        remindAt: params.remind_at,
        timeZone: tz,
        message: params.message,
        source: 'twin',
      });
    },
  });

  log.info('Extended tools registered', { count: EXTENDED_TOOL_NAMES.length });
}
