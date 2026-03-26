/**
 * Tool Registry — Platform-Agnostic Tool Registration for Agent Actions
 * ======================================================================
 * Dynamic tool registration system that auto-discovers tools from all
 * connected platforms. Each platform exposes a standard interface
 * (get_recent_data, get_status, get_insights) plus platform-specific tools.
 *
 * Architecture supports expansion: new platforms auto-register by
 * implementing the standard interface. No hardcoded platform lists.
 *
 * Inspired by:
 *   - MCP Tool Discovery (modelcontextprotocol.io)
 *   - OpenClaw SKILL.md pattern
 *   - Composio 250+ managed tools
 */

import { supabaseAdmin } from './database.js';
import { getValidAccessToken } from './tokenRefreshService.js';
import { createLogger } from './logger.js';
import axios from 'axios';

const log = createLogger('ToolRegistry');

// In-memory tool registry (populated at startup + on demand)
const registry = new Map();

/**
 * Tool definition shape:
 * {
 *   name: 'spotify_now_playing',
 *   platform: 'spotify',
 *   description: 'Get currently playing track on Spotify',
 *   category: 'music',
 *   parameters: { type: 'object', properties: {} },
 *   executor: async (userId, params) => { ... },
 *   requiresConnection: true,
 * }
 */

/**
 * Register a tool in the registry.
 */
export function registerTool(toolDef) {
  if (!toolDef.name || !toolDef.executor) {
    throw new Error(`Tool must have name and executor: ${JSON.stringify(toolDef)}`);
  }

  registry.set(toolDef.name, {
    ...toolDef,
    registeredAt: new Date().toISOString(),
  });

  log.debug('Tool registered', { name: toolDef.name, platform: toolDef.platform });
}

/**
 * Get all available tools for a user (filtered by connected platforms).
 */
export async function getAvailableTools(userId) {
  // Get user's connected platforms
  const connectedPlatforms = await getConnectedPlatforms(userId);
  const connectedSet = new Set(connectedPlatforms.map(p => p.platform));

  const available = [];
  for (const [name, tool] of registry) {
    // Include tools that don't require a connection OR whose platform is connected
    if (!tool.requiresConnection || connectedSet.has(tool.platform)) {
      available.push({
        name: tool.name,
        platform: tool.platform,
        description: tool.description,
        category: tool.category,
        parameters: tool.parameters,
      });
    }
  }

  return available;
}

/**
 * Execute a tool by name with permission checking.
 */
export async function executeTool(userId, toolName, params = {}) {
  const tool = registry.get(toolName);
  if (!tool) {
    throw new Error(`Tool not found: ${toolName}`);
  }

  // Check platform connection if required
  if (tool.requiresConnection) {
    const connected = await isConnected(userId, tool.platform);
    if (!connected) {
      return {
        success: false,
        error: `Platform "${tool.platform}" is not connected. Connect it in Settings.`,
      };
    }
  }

  // Check autonomy level for write-back tools
  if (tool.minAutonomyLevel != null && tool.minAutonomyLevel > 0) {
    try {
      const { getAutonomyBySkillName, AUTONOMY_LEVELS } = await import('./autonomyService.js');
      // Derive skill name from tool platform or use a default
      const skillName = tool.skillName || `${tool.platform || 'general'}_actions`;
      const userLevel = await getAutonomyBySkillName(userId, skillName);

      if (userLevel < tool.minAutonomyLevel) {
        const levelLabels = { 1: 'SUGGEST', 2: 'DRAFT', 3: 'ACT_NOTIFY', 4: 'AUTONOMOUS' };
        log.info('Tool blocked by autonomy level', {
          userId, tool: toolName,
          userLevel, required: tool.minAutonomyLevel,
        });
        return {
          success: false,
          error: 'insufficient_autonomy',
          message: `This action requires autonomy level ${tool.minAutonomyLevel} (${levelLabels[tool.minAutonomyLevel] || 'unknown'}) but user is at level ${userLevel}. Upgrade in Settings.`,
          required: tool.minAutonomyLevel,
          current: userLevel,
          tool: toolName,
        };
      }
    } catch (autonomyErr) {
      // Non-fatal: if autonomy check fails, default to allowing read (L1) but blocking writes (L2+)
      if (tool.minAutonomyLevel >= 2) {
        log.warn('Autonomy check failed, blocking write tool as precaution', { tool: toolName, error: autonomyErr.message });
        return {
          success: false,
          error: 'autonomy_check_failed',
          message: 'Could not verify permission level. Write action blocked as a safety precaution.',
          tool: toolName,
        };
      }
    }
  }

  try {
    const startTime = Date.now();
    const result = await tool.executor(userId, params);
    const elapsed = Date.now() - startTime;

    log.info('Tool executed', { userId, tool: toolName, elapsedMs: elapsed });

    return { success: true, data: result, tool: toolName, elapsedMs: elapsed };
  } catch (err) {
    log.error('Tool execution failed', { userId, tool: toolName, error: err.message });
    return { success: false, error: err.message, tool: toolName };
  }
}

/**
 * Get tool definitions formatted for LLM function calling.
 * Returns array of tool schemas compatible with OpenAI/Anthropic format.
 */
export function getToolSchemas(tools) {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters || { type: 'object', properties: {} },
    }
  }));
}

// ========================================================================
// Platform connection helpers
// ========================================================================

async function getConnectedPlatforms(userId) {
  try {
    const { data } = await supabaseAdmin
      .from('platform_connections')
      .select('platform, last_sync')
      .eq('user_id', userId);
    return data || [];
  } catch {
    return [];
  }
}

async function isConnected(userId, platform) {
  const { data } = await supabaseAdmin
    .from('platform_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', platform)
    .limit(1)
    .single();
  return !!data;
}

// ========================================================================
// Register built-in tools from all platforms
// Each platform provides a standard interface + platform-specific tools.
// This runs at module load time.
// ========================================================================

function registerBuiltInTools() {
  // ---- STANDARD TOOLS (available for all connected platforms) ----

  // Generic platform data tool — works for ANY platform
  registerTool({
    name: 'get_platform_data',
    platform: null,
    description: 'Get the most recent data from any connected platform',
    category: 'data',
    parameters: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: 'Platform name (spotify, calendar, whoop, youtube, gmail, discord, linkedin, github, reddit, twitch)' },
        data_type: { type: 'string', description: 'Optional: specific data type to retrieve' },
      },
      required: ['platform']
    },
    requiresConnection: false, // We check dynamically
    executor: async (userId, params) => {
      const { platform, data_type } = params;
      const { data } = await supabaseAdmin
        .from('platform_data')
        .select('raw_data, data_type, created_at')
        .eq('user_id', userId)
        .eq('provider', platform)
        .order('created_at', { ascending: false })
        .limit(data_type ? 1 : 5);
      return data || [];
    }
  });

  // ---- SPOTIFY ----
  registerTool({
    name: 'spotify_now_playing',
    platform: 'spotify',
    description: 'Get the currently playing track on Spotify',
    category: 'music',
    parameters: { type: 'object', properties: {} },
    requiresConnection: true,
    executor: async (userId) => {
      const { data } = await supabaseAdmin
        .from('platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('provider', 'spotify')
        .eq('data_type', 'currently_playing')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return data?.raw_data || { playing: false };
    }
  });

  registerTool({
    name: 'spotify_recent_tracks',
    platform: 'spotify',
    description: 'Get recently played tracks on Spotify',
    category: 'music',
    parameters: { type: 'object', properties: { limit: { type: 'number', default: 10 } } },
    requiresConnection: true,
    executor: async (userId, params) => {
      const { data } = await supabaseAdmin
        .from('platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('provider', 'spotify')
        .eq('data_type', 'recent_tracks')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return data?.raw_data || [];
    }
  });

  // Genre-energy mapping for playlist scoring (shared with spotify-oauth.js)
  const GENRE_ENERGY_MAP = {
    calm: ['ambient', 'classical', 'jazz', 'acoustic', 'chill', 'piano', 'blues', 'folk', 'soul', 'world-music'],
    focused: ['indie', 'alternative', 'folk', 'indie-pop', 'singer-songwriter', 'acoustic', 'jazz', 'blues', 'classical', 'study'],
    energizing: ['pop', 'rock', 'hip-hop', 'r-n-b', 'soul', 'funk', 'disco', 'synth-pop', 'indie-pop', 'dance', 'reggae', 'party'],
    power: ['edm', 'dance', 'electronic', 'house', 'techno', 'dubstep', 'drum-and-bass', 'metal', 'punk', 'hardcore', 'hardstyle', 'trance'],
  };

  registerTool({
    name: 'spotify_search_playlists',
    platform: 'spotify',
    description: 'Search user playlists filtered by energy level (calm/focused/energizing/power). Returns top 3 matches.',
    category: 'music',
    parameters: {
      type: 'object',
      properties: {
        energyLevel: { type: 'string', enum: ['calm', 'focused', 'energizing', 'power'], description: 'Target energy level' }
      },
      required: ['energyLevel']
    },
    requiresConnection: true,
    executor: async (userId, params) => {
      const tokenResult = await getValidAccessToken(userId, 'spotify');
      if (!tokenResult.success) return { success: false, error: 'Spotify not connected' };

      const headers = { Authorization: `Bearer ${tokenResult.accessToken}` };

      // Fetch user playlists
      const playlistsRes = await axios.get('https://api.spotify.com/v1/me/playlists?limit=50', { headers, timeout: 8000 });
      const playlists = playlistsRes.data?.items || [];
      if (playlists.length === 0) return [];

      // Score each playlist by name heuristics (fast, no extra API calls)
      const targetLevel = params.energyLevel || 'focused';
      const targetGenres = GENRE_ENERGY_MAP[targetLevel] || GENRE_ENERGY_MAP.focused;

      const scored = playlists.map(pl => {
        const name = (pl.name || '').toLowerCase();
        let score = 0;
        for (const genre of targetGenres) {
          if (name.includes(genre)) score += 10;
        }
        // Boost common mood keywords in playlist names
        if (targetLevel === 'calm' && /chill|relax|sleep|ambient|quiet|peace/i.test(name)) score += 15;
        if (targetLevel === 'focused' && /focus|study|work|deep|concentrate|flow/i.test(name)) score += 15;
        if (targetLevel === 'energizing' && /energy|hype|pump|morning|vibe|party|mood/i.test(name)) score += 15;
        if (targetLevel === 'power' && /workout|gym|beast|power|intense|run|lift/i.test(name)) score += 15;
        return { id: pl.id, name: pl.name, trackCount: pl.tracks?.total || 0, imageUrl: pl.images?.[0]?.url, score };
      });

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, 3).map(({ score, ...rest }) => rest);
    }
  });

  registerTool({
    name: 'spotify_start_playlist',
    platform: 'spotify',
    description: 'Start playing a Spotify playlist on the user\'s active device',
    category: 'music',
    parameters: {
      type: 'object',
      properties: {
        playlistId: { type: 'string', description: 'Spotify playlist ID to play' }
      },
      required: ['playlistId']
    },
    requiresConnection: true,
    executor: async (userId, params) => {
      const tokenResult = await getValidAccessToken(userId, 'spotify');
      if (!tokenResult.success) return { success: false, error: 'Spotify not connected' };

      const headers = { Authorization: `Bearer ${tokenResult.accessToken}`, 'Content-Type': 'application/json' };

      try {
        await axios.put(
          'https://api.spotify.com/v1/me/player/play',
          { context_uri: `spotify:playlist:${params.playlistId}` },
          { headers, timeout: 8000 }
        );
        return { success: true, playlistId: params.playlistId, action: 'playback_started' };
      } catch (err) {
        if (err.response?.status === 404) {
          return { success: false, error: 'no_active_device', message: 'No active Spotify device found. Open Spotify on any device first.' };
        }
        return { success: false, error: err.response?.status || err.message };
      }
    }
  });

  // ---- CALENDAR ----
  // calendar_today moved to tools/googleWorkspaceTools.js (live API version)

  registerTool({
    name: 'calendar_suggest_reschedule',
    platform: 'google_calendar',
    description: 'Suggest rescheduling a calendar event based on energy optimization',
    category: 'productivity',
    parameters: {
      type: 'object',
      properties: {
        eventTitle: { type: 'string', description: 'Title of the event to reschedule' },
        reason: { type: 'string', description: 'Reason for rescheduling suggestion' },
      },
    },
    requiresConnection: false,
    executor: async (userId, params) => {
      // Suggestion tool — does not modify the calendar.
      // Returns a formatted suggestion for the twin to present.
      return {
        success: true,
        data: {
          suggestion: `Consider rescheduling "${params.eventTitle}": ${params.reason}`,
        },
      };
    },
  });

  // ---- WHOOP ----
  registerTool({
    name: 'whoop_recovery',
    platform: 'whoop',
    description: 'Get current Whoop recovery score, strain, and sleep data',
    category: 'health',
    parameters: { type: 'object', properties: {} },
    requiresConnection: true,
    executor: async (userId) => {
      const { data } = await supabaseAdmin
        .from('platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('provider', 'whoop')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return data?.raw_data || {};
    }
  });

  // ---- YOUTUBE ----
  registerTool({
    name: 'youtube_recent',
    platform: 'youtube',
    description: 'Get recent YouTube watch activity',
    category: 'content',
    parameters: { type: 'object', properties: {} },
    requiresConnection: true,
    executor: async (userId) => {
      const { data } = await supabaseAdmin
        .from('platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('provider', 'youtube')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return data?.raw_data || {};
    }
  });

  // ---- GMAIL ----
  // gmail_recent replaced by gmail_search in tools/googleWorkspaceTools.js (live API)

  // ---- DISCORD ----
  registerTool({
    name: 'discord_activity',
    platform: 'discord',
    description: 'Get recent Discord server activity and communication patterns',
    category: 'social',
    parameters: { type: 'object', properties: {} },
    requiresConnection: true,
    executor: async (userId) => {
      const { data } = await supabaseAdmin
        .from('platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('provider', 'discord')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return data?.raw_data || {};
    }
  });

  // ---- GITHUB ----
  registerTool({
    name: 'github_activity',
    platform: 'github',
    description: 'Get recent GitHub coding activity and contributions',
    category: 'productivity',
    parameters: { type: 'object', properties: {} },
    requiresConnection: true,
    executor: async (userId) => {
      const { data } = await supabaseAdmin
        .from('platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('provider', 'github')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return data?.raw_data || {};
    }
  });

  // ---- LINKEDIN ----
  registerTool({
    name: 'linkedin_profile',
    platform: 'linkedin',
    description: 'Get LinkedIn career profile and network data',
    category: 'career',
    parameters: { type: 'object', properties: {} },
    requiresConnection: true,
    executor: async (userId) => {
      const { data } = await supabaseAdmin
        .from('platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('provider', 'linkedin')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return data?.raw_data || {};
    }
  });

  // ---- REDDIT ----
  registerTool({
    name: 'reddit_activity',
    platform: 'reddit',
    description: 'Get Reddit community interests and discussion patterns',
    category: 'social',
    parameters: { type: 'object', properties: {} },
    requiresConnection: true,
    executor: async (userId) => {
      const { data } = await supabaseAdmin
        .from('platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('provider', 'reddit')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return data?.raw_data || {};
    }
  });

  // ---- TWITCH ----
  registerTool({
    name: 'twitch_activity',
    platform: 'twitch',
    description: 'Get Twitch gaming and streaming activity',
    category: 'entertainment',
    parameters: { type: 'object', properties: {} },
    requiresConnection: true,
    executor: async (userId) => {
      const { data } = await supabaseAdmin
        .from('platform_data')
        .select('raw_data')
        .eq('user_id', userId)
        .eq('provider', 'twitch')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return data?.raw_data || {};
    }
  });

  // ---- MEMORY STREAM TOOLS (always available) ----
  registerTool({
    name: 'search_memories',
    platform: null,
    description: 'Search the user\'s memory stream for relevant memories',
    category: 'memory',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results', default: 10 },
        memory_type: { type: 'string', description: 'Filter by type: fact, reflection, conversation, platform_data' },
      },
      required: ['query']
    },
    requiresConnection: false,
    executor: async (userId, params) => {
      // Import dynamically to avoid circular dependency
      const { retrieveMemories } = await import('./memoryStreamService.js');
      const memories = await retrieveMemories(userId, params.query, {
        limit: params.limit || 10,
        memoryType: params.memory_type || null,
      });
      return memories.map(m => ({
        content: m.content,
        type: m.memory_type,
        importance: m.importance_score,
        createdAt: m.created_at,
      }));
    }
  });

  registerTool({
    name: 'add_memory',
    platform: null,
    description: 'Store a new fact or observation in the user\'s memory stream',
    category: 'memory',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Memory content' },
        memory_type: { type: 'string', description: 'Type: fact, observation', default: 'fact' },
        importance: { type: 'number', description: 'Importance 1-10', default: 6 },
      },
      required: ['content']
    },
    requiresConnection: false,
    executor: async (userId, params) => {
      const { addMemory } = await import('./memoryStreamService.js');
      const result = await addMemory(
        userId,
        params.content,
        params.memory_type || 'fact',
        { source: 'agent_tool' },
        { importanceScore: params.importance || 6 }
      );
      return { stored: true, id: result?.id };
    }
  });

  // ---- SMART EMAIL DRAFT ----
  registerTool({
    name: 'draft_email_reply',
    platform: 'google_gmail',
    description: 'Draft an email reply in the user\'s writing voice using their OCEAN personality + stylometric fingerprint',
    category: 'communication',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient name or email context' },
        context: { type: 'string', description: 'What the email should say/address' },
      },
      required: ['to']
    },
    requiresConnection: false,
    executor: async (userId, params) => {
      const { complete: llmComplete, TIER_ANALYSIS: tier } = await import('./llmGateway.js');
      const { getBlocks: gb } = await import('./coreMemoryService.js');

      // Fetch personality + stylometrics
      const { data: prof } = await supabaseAdmin
        .from('user_personality_profiles')
        .select('openness, conscientiousness, extraversion, agreeableness, neuroticism, stylometric_fingerprint')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const blocks = await gb(userId);
      const sl = prof?.stylometric_fingerprint?.avg_sentence_length;
      const f = prof?.stylometric_fingerprint?.formality_score;

      const styleGuide = prof ? `\nWRITING STYLE TO MATCH:
- Sentences: ${sl ? (sl < 12 ? 'short, punchy' : sl < 20 ? 'medium' : 'long, detailed') : 'natural'}
- Formality: ${f != null ? (f < 0.3 ? 'very casual' : f < 0.6 ? 'balanced' : 'professional') : 'natural'}
- OCEAN: O=${((prof.openness||0.5)*100).toFixed(0)} C=${((prof.conscientiousness||0.5)*100).toFixed(0)} E=${((prof.extraversion||0.5)*100).toFixed(0)} A=${((prof.agreeableness||0.5)*100).toFixed(0)} N=${((prof.neuroticism||0.5)*100).toFixed(0)}` : '';

      const prompt = `Draft an email reply for this person.

PERSONALITY: ${blocks.soul_signature?.content || 'Unknown'}
${styleGuide}

TO: ${params.to}
CONTEXT: ${params.context || 'General reply'}

Write the email EXACTLY in their voice. Include Subject (if new), greeting, body, sign-off. Do NOT sound like a generic AI.`;

      const resp = await llmComplete({
        messages: [{ role: 'user', content: prompt }],
        tier, maxTokens: 500, temperature: 0.6, userId, purpose: 'draft_email'
      });

      return { draft: resp?.content || resp?.text || 'Failed to generate draft' };
    }
  });

  // ========================================================================
  // GOOGLE WORKSPACE ACTIONS — registered via tools/googleWorkspaceTools.js
  // Import is triggered by server.js at startup. See that file for the full
  // list of Gmail, Calendar, Drive, Docs, Sheets, and Contacts tools.
  // ========================================================================

  log.info('Built-in tools registered', { count: registry.size });
}

// Auto-register on module load
registerBuiltInTools();

// Register MCP tools if configured (non-blocking, non-fatal)
registerMCPTools().catch(() => {});

/**
 * Bridge MCP servers into the twin's tool registry.
 * Each enabled MCP server becomes a callable tool for the agent.
 * Called once at startup if MCP config exists.
 */
export async function registerMCPTools() {
  try {
    const mcpClient = (await import('./mcp-client.js')).default;
    const { mcpServers } = await mcpClient.listAvailableServers();

    let registered = 0;
    for (const server of mcpServers) {
      registerTool({
        name: `mcp_${server.platform}_extract`,
        platform: server.platform,
        description: `Extract data from ${server.platform} via MCP server`,
        category: 'mcp',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Optional: specific data action' },
          },
        },
        requiresConnection: true,
        executor: async (userId, params) => {
          return mcpClient.extractData(server.platform, null, userId);
        },
      });
      registered++;
    }

    if (registered > 0) {
      log.info('MCP tools registered', { count: registered });
    }
  } catch (err) {
    // Non-fatal — MCP is optional
    log.debug('MCP tool registration skipped', { error: err.message });
  }
}

export { registry };
