/**
 * MCP (Model Context Protocol) Routes
 * Manages connections to MCP servers for enhanced data extraction
 */

import express from 'express';
import mcpClient from '../services/mcp-client.js';

const router = express.Router();

/**
 * GET /api/mcp/status
 * Get MCP infrastructure status and available servers
 */
router.get('/status', async (req, res) => {
  try {
    await mcpClient.loadConfig();
    const servers = await mcpClient.listAvailableServers();

    res.json({
      success: true,
      data: {
        ...servers,
        message: 'MCP infrastructure operational'
      }
    });
  } catch (error) {
    console.error('Error getting MCP status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get MCP status'
    });
  }
});

/**
 * GET /api/mcp/platform/:platform/status
 * Check if a specific platform uses MCP or OAuth fallback
 */
router.get('/platform/:platform/status', async (req, res) => {
  try {
    const { platform } = req.params;

    await mcpClient.loadConfig();

    const usesMCP = mcpClient.usesMCP(platform);

    if (usesMCP) {
      const serverStatus = await mcpClient.getServerStatus(platform);
      res.json({
        success: true,
        data: {
          platform,
          method: 'mcp',
          ...serverStatus
        }
      });
    } else {
      const fallbackConfig = mcpClient.getFallbackConfig(platform);
      res.json({
        success: true,
        data: {
          platform,
          method: 'oauth-fallback',
          ...fallbackConfig
        }
      });
    }
  } catch (error) {
    console.error(`Error checking platform ${req.params.platform}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to check platform status'
    });
  }
});

/**
 * POST /api/mcp/extract/:platform
 * Extract data from a platform using MCP
 */
router.post('/extract/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const { userId, accessToken } = req.body;

    if (!userId || !accessToken) {
      return res.status(400).json({
        success: false,
        error: 'userId and accessToken are required'
      });
    }

    await mcpClient.loadConfig();

    if (!mcpClient.usesMCP(platform)) {
      return res.status(400).json({
        success: false,
        error: `${platform} does not use MCP. Use OAuth endpoints instead.`
      });
    }

    const extractedData = await mcpClient.extractData(platform, accessToken, userId);

    res.json({
      success: true,
      data: extractedData
    });

  } catch (error) {
    console.error(`Error extracting data from ${req.params.platform}:`, error);
    res.status(500).json({
      success: false,
      error: `Failed to extract data from ${req.params.platform}`
    });
  }
});

/**
 * POST /api/mcp/initialize/:platform
 * Initialize MCP server connection for a platform
 */
router.post('/initialize/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const { credentials } = req.body;

    await mcpClient.loadConfig();

    if (!mcpClient.usesMCP(platform)) {
      return res.status(400).json({
        success: false,
        error: `${platform} does not use MCP`
      });
    }

    const serverInfo = await mcpClient.initializeServer(platform, credentials);

    res.json({
      success: true,
      data: {
        platform,
        initialized: true,
        ...serverInfo,
        message: `MCP server for ${platform} initialized successfully`
      }
    });

  } catch (error) {
    console.error(`Error initializing MCP server for ${req.params.platform}:`, error);
    res.status(500).json({
      success: false,
      error: `Failed to initialize MCP server for ${req.params.platform}`
    });
  }
});

/**
 * GET /api/mcp/platforms
 * List all platforms with their connection method (MCP vs OAuth)
 */
router.get('/platforms', async (req, res) => {
  try {
    await mcpClient.loadConfig();

    const platforms = {
      mcp: [
        { name: 'Spotify', key: 'spotify', description: 'Music streaming and listening preferences' },
        { name: 'Discord', key: 'discord', description: 'Community interactions and communication' },
        { name: 'YouTube', key: 'youtube', description: 'Video watch history and subscriptions' },
        { name: 'Slack', key: 'slack', description: 'Workspace communication patterns' },
        { name: 'GitHub', key: 'github', description: 'Code repositories and contribution patterns' }
      ],
      oauth: [
        { name: 'Microsoft Teams', key: 'teams', description: 'Team collaboration and meetings', reason: 'No MCP available' },
        { name: 'Gmail', key: 'gmail', description: 'Email communication style', reason: 'Existing OAuth implementation' },
        { name: 'Google Calendar', key: 'calendar', description: 'Schedule and time management', reason: 'Existing OAuth implementation' }
      ],
      manual: [
        { name: 'Netflix', key: 'netflix', description: 'Viewing history and preferences', reason: 'No public API' },
        { name: 'Steam', key: 'steam', description: 'Gaming preferences and playtime', reason: 'OpenID 2.0 only' }
      ]
    };

    res.json({
      success: true,
      data: platforms,
      summary: {
        mcpPlatforms: platforms.mcp.length,
        oauthPlatforms: platforms.oauth.length,
        manualPlatforms: platforms.manual.length,
        total: platforms.mcp.length + platforms.oauth.length + platforms.manual.length
      }
    });

  } catch (error) {
    console.error('Error listing platforms:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list platforms'
    });
  }
});

export default router;
