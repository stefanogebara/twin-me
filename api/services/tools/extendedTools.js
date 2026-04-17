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
  'spotify_queue',
  'spotify_play_track',
  'meeting_prep',
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
    description: 'Generate a pre-meeting briefing: attendee background, company context, past touchpoints from memory, talking points, and watch-outs.',
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

  log.info('Extended tools registered', { count: EXTENDED_TOOL_NAMES.length });
}
