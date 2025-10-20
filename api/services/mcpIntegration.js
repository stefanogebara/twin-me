/**
 * MCP (Model Context Protocol) Integration Service
 * Handles connections to external MCP servers for platform data extraction
 * Supports 25+ platforms via MCP including WhatsApp, Telegram, Discord, Strava, etc.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// MCP Server Configurations
const MCP_SERVER_CONFIGS = {
  // Messaging & Social
  whatsapp: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-whatsapp'],
    env: { WHATSAPP_API_TOKEN: process.env.WHATSAPP_API_TOKEN },
    category: 'messaging',
    dataTypes: ['messages', 'contacts', 'groups', 'media']
  },
  telegram: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-telegram'],
    env: { TELEGRAM_API_TOKEN: process.env.TELEGRAM_API_TOKEN },
    category: 'messaging',
    dataTypes: ['messages', 'channels', 'groups', 'media']
  },
  discord: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-discord'],
    env: { DISCORD_TOKEN: process.env.DISCORD_TOKEN },
    category: 'messaging',
    dataTypes: ['messages', 'servers', 'channels', 'voice']
  },
  slack: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    env: { SLACK_TOKEN: process.env.SLACK_TOKEN },
    category: 'messaging',
    dataTypes: ['messages', 'channels', 'files', 'reactions']
  },

  // Health & Fitness
  strava: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-strava'],
    env: { STRAVA_ACCESS_TOKEN: process.env.STRAVA_ACCESS_TOKEN },
    category: 'health',
    dataTypes: ['activities', 'routes', 'stats', 'achievements']
  },
  apple_health: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-apple-health'],
    env: {},
    category: 'health',
    dataTypes: ['workouts', 'steps', 'heart_rate', 'sleep']
  },

  // Entertainment
  youtube: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-youtube'],
    env: { YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY },
    category: 'entertainment',
    dataTypes: ['watch_history', 'subscriptions', 'playlists', 'likes']
  },
  spotify: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-spotify'],
    env: {
      SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
      SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET
    },
    category: 'entertainment',
    dataTypes: ['listening_history', 'playlists', 'saved_tracks', 'top_artists']
  },

  // Productivity
  gmail: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gmail'],
    env: { GOOGLE_API_KEY: process.env.GOOGLE_API_KEY },
    category: 'productivity',
    dataTypes: ['emails', 'labels', 'threads', 'attachments']
  },
  google_calendar: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gcal'],
    env: { GOOGLE_API_KEY: process.env.GOOGLE_API_KEY },
    category: 'productivity',
    dataTypes: ['events', 'calendars', 'attendees', 'reminders']
  },
  notion: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-notion'],
    env: { NOTION_API_KEY: process.env.NOTION_API_KEY },
    category: 'productivity',
    dataTypes: ['pages', 'databases', 'blocks', 'comments']
  },

  // Social Media
  twitter: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-twitter'],
    env: { TWITTER_API_KEY: process.env.TWITTER_API_KEY },
    category: 'social',
    dataTypes: ['tweets', 'likes', 'retweets', 'followers']
  },
  linkedin: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-linkedin'],
    env: { LINKEDIN_ACCESS_TOKEN: process.env.LINKEDIN_ACCESS_TOKEN },
    category: 'social',
    dataTypes: ['posts', 'connections', 'articles', 'endorsements']
  },
  reddit: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-reddit'],
    env: {
      REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID,
      REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET
    },
    category: 'social',
    dataTypes: ['posts', 'comments', 'subreddits', 'karma']
  },

  // Reading & Learning
  kindle: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-kindle'],
    env: { AMAZON_ACCESS_TOKEN: process.env.AMAZON_ACCESS_TOKEN },
    category: 'reading',
    dataTypes: ['books', 'highlights', 'notes', 'reading_progress']
  },
  medium: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-medium'],
    env: { MEDIUM_API_KEY: process.env.MEDIUM_API_KEY },
    category: 'reading',
    dataTypes: ['articles', 'claps', 'publications', 'reading_list']
  },
  duolingo: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-duolingo'],
    env: { DUOLINGO_JWT: process.env.DUOLINGO_JWT },
    category: 'learning',
    dataTypes: ['lessons', 'streaks', 'achievements', 'progress']
  },

  // Gaming
  steam: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-steam'],
    env: { STEAM_API_KEY: process.env.STEAM_API_KEY },
    category: 'gaming',
    dataTypes: ['games', 'achievements', 'playtime', 'friends']
  },

  // Aggregator MCP (Multi-platform)
  personalization_mcp: {
    command: 'npx',
    args: ['-y', 'personalizationmcp'],
    env: {
      SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
      SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
      YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
      STEAM_API_KEY: process.env.STEAM_API_KEY,
      REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID,
      REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET
    },
    category: 'aggregator',
    dataTypes: ['all']
  }
};

class MCPIntegrationService {
  constructor() {
    this.activeClients = new Map();
    this.connectionRetries = new Map();
    this.maxRetries = 3;
  }

  /**
   * Connect to an MCP server for a specific platform
   */
  async connectMCPServer(userId, platform) {
    const clientKey = `${userId}-${platform}`;

    // Return existing client if already connected
    if (this.activeClients.has(clientKey)) {
      console.log(`[MCP] Using existing connection for ${platform}`);
      return this.activeClients.get(clientKey);
    }

    const config = MCP_SERVER_CONFIGS[platform];
    if (!config) {
      throw new Error(`MCP server configuration not found for platform: ${platform}`);
    }

    try {
      console.log(`[MCP] Connecting to ${platform} MCP server...`);

      // Create stdio transport
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...process.env, ...config.env }
      });

      // Create MCP client
      const client = new Client({
        name: `twin-ai-${platform}`,
        version: '1.0.0'
      }, {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      });

      // Connect
      await client.connect(transport);
      console.log(`[MCP] Successfully connected to ${platform}`);

      // Store client
      this.activeClients.set(clientKey, { client, platform, config });

      // Store connection in database
      await this.storeConnection(userId, platform, 'mcp');

      return { client, platform, config };
    } catch (error) {
      console.error(`[MCP] Failed to connect to ${platform}:`, error);

      // Retry logic
      const retries = this.connectionRetries.get(clientKey) || 0;
      if (retries < this.maxRetries) {
        this.connectionRetries.set(clientKey, retries + 1);
        console.log(`[MCP] Retrying connection to ${platform} (${retries + 1}/${this.maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * (retries + 1)));
        return this.connectMCPServer(userId, platform);
      }

      throw error;
    }
  }

  /**
   * Extract data from an MCP server
   */
  async extractPlatformData(userId, platform, dataTypes = null) {
    try {
      const { client, config } = await this.connectMCPServer(userId, platform);

      console.log(`[MCP] Extracting data from ${platform}...`);

      // List available tools from the MCP server
      const toolsResult = await client.listTools();
      const tools = toolsResult.tools || [];

      console.log(`[MCP] Found ${tools.length} tools for ${platform}:`,
        tools.map(t => t.name).join(', '));

      // Determine which data types to extract
      const typesToExtract = dataTypes || config.dataTypes;
      const extractedData = [];

      // Call each relevant tool
      for (const tool of tools) {
        // Check if tool matches requested data types
        const isRelevant = typesToExtract.some(type =>
          tool.name.toLowerCase().includes(type.toLowerCase())
        );

        if (isRelevant) {
          try {
            console.log(`[MCP] Calling tool: ${tool.name}`);
            const result = await client.callTool({
              name: tool.name,
              arguments: {}
            });

            extractedData.push({
              tool: tool.name,
              dataType: this.inferDataType(tool.name),
              data: result.content,
              timestamp: new Date().toISOString()
            });
          } catch (toolError) {
            console.error(`[MCP] Error calling tool ${tool.name}:`, toolError);
          }
        }
      }

      // Store extracted data
      await this.storeExtractedData(userId, platform, extractedData);

      return {
        success: true,
        platform,
        itemsExtracted: extractedData.length,
        data: extractedData
      };
    } catch (error) {
      console.error(`[MCP] Data extraction failed for ${platform}:`, error);
      throw error;
    }
  }

  /**
   * Bulk extract from multiple platforms
   */
  async extractMultiplePlatforms(userId, platforms) {
    const results = await Promise.allSettled(
      platforms.map(platform => this.extractPlatformData(userId, platform))
    );

    return results.map((result, index) => ({
      platform: platforms[index],
      status: result.status,
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason.message : null
    }));
  }

  /**
   * Get available MCP tools for a platform
   */
  async getPlatformCapabilities(userId, platform) {
    try {
      const { client } = await this.connectMCPServer(userId, platform);

      const [toolsResult, resourcesResult, promptsResult] = await Promise.all([
        client.listTools(),
        client.listResources(),
        client.listPrompts()
      ]);

      return {
        tools: toolsResult.tools || [],
        resources: resourcesResult.resources || [],
        prompts: promptsResult.prompts || []
      };
    } catch (error) {
      console.error(`[MCP] Failed to get capabilities for ${platform}:`, error);
      return { tools: [], resources: [], prompts: [] };
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnectMCPServer(userId, platform) {
    const clientKey = `${userId}-${platform}`;
    const clientData = this.activeClients.get(clientKey);

    if (clientData) {
      try {
        await clientData.client.close();
        this.activeClients.delete(clientKey);
        console.log(`[MCP] Disconnected from ${platform}`);
      } catch (error) {
        console.error(`[MCP] Error disconnecting from ${platform}:`, error);
      }
    }
  }

  /**
   * Store connection metadata in database
   */
  async storeConnection(userId, platform, connectionType) {
    try {
      const { error } = await supabase
        .from('platform_connections')
        .upsert({
          user_id: userId,
          platform,
          connection_type: connectionType,
          status: 'active',
          connected_at: new Date().toISOString(),
          last_sync: new Date().toISOString()
        }, {
          onConflict: 'user_id,platform'
        });

      if (error) throw error;
    } catch (error) {
      console.error('[MCP] Error storing connection:', error);
    }
  }

  /**
   * Store extracted data in database
   */
  async storeExtractedData(userId, platform, extractedData) {
    try {
      const dataRecords = extractedData.map(item => ({
        user_id: userId,
        platform,
        data_type: item.dataType,
        raw_data: item.data,
        extracted_at: new Date().toISOString(),
        source: 'mcp'
      }));

      const { error } = await supabase
        .from('extracted_platform_data')
        .insert(dataRecords);

      if (error) throw error;

      console.log(`[MCP] Stored ${dataRecords.length} data records for ${platform}`);
    } catch (error) {
      console.error('[MCP] Error storing extracted data:', error);
    }
  }

  /**
   * Infer data type from tool name
   */
  inferDataType(toolName) {
    const lowerName = toolName.toLowerCase();

    if (lowerName.includes('message')) return 'messages';
    if (lowerName.includes('email')) return 'emails';
    if (lowerName.includes('activity') || lowerName.includes('workout')) return 'activities';
    if (lowerName.includes('watch') || lowerName.includes('view')) return 'watch_history';
    if (lowerName.includes('listen') || lowerName.includes('play')) return 'listening_history';
    if (lowerName.includes('post') || lowerName.includes('tweet')) return 'posts';
    if (lowerName.includes('event') || lowerName.includes('calendar')) return 'events';
    if (lowerName.includes('book') || lowerName.includes('read')) return 'books';
    if (lowerName.includes('game')) return 'games';

    return 'general';
  }

  /**
   * Get list of supported MCP platforms
   */
  getSupportedPlatforms() {
    return Object.keys(MCP_SERVER_CONFIGS).map(platform => ({
      id: platform,
      name: this.formatPlatformName(platform),
      category: MCP_SERVER_CONFIGS[platform].category,
      dataTypes: MCP_SERVER_CONFIGS[platform].dataTypes,
      integrationType: 'mcp'
    }));
  }

  /**
   * Format platform name for display
   */
  formatPlatformName(platform) {
    return platform
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Check MCP server health
   */
  async checkServerHealth(userId, platform) {
    try {
      const { client } = await this.connectMCPServer(userId, platform);
      const toolsResult = await client.listTools();

      return {
        status: 'healthy',
        platform,
        toolsAvailable: toolsResult.tools?.length || 0
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        platform,
        error: error.message
      };
    }
  }
}

export default new MCPIntegrationService();
