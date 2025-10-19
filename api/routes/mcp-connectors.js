import express from 'express';
import { DataExtractionService } from '../services/dataExtraction.js';
import mcpClient from '../services/mcp-client.js';

const router = express.Router();
const extractionService = new DataExtractionService();

// Microsoft Teams connector
router.post('/connect/teams', async (req, res) => {
  try {
    const { userId } = req.body;

    // Microsoft Teams OAuth URL
    const clientId = process.env.TEAMS_CLIENT_ID || 'your-teams-client-id';
    const redirectUri = encodeURIComponent(`${process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`);
    const scope = encodeURIComponent('User.Read Chat.Read Channel.ReadBasic.All Files.Read.All');
    const state = Buffer.from(JSON.stringify({
      provider: 'teams',
      userId,
      timestamp: Date.now()
    })).toString('base64');

    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
      `client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&` +
      `response_type=code&state=${state}`;

    res.json({
      success: true,
      authUrl,
      message: 'Redirect user to Teams OAuth'
    });
  } catch (error) {
    console.error('Teams connection error:', error);
    res.status(500).json({ error: 'Failed to initialize Teams connection' });
  }
});

// Slack connector
router.post('/connect/slack', async (req, res) => {
  try {
    const { userId } = req.body;

    // Slack OAuth URL - Using user_scope for user token (not bot token)
    const clientId = process.env.SLACK_CLIENT_ID || 'your-slack-client-id';
    const redirectUri = encodeURIComponent(`${process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`);
    // User scopes aligned with Slack app configuration
    const userScope = 'channels:read,files:read,groups:read,users:read,users:read.email,search:read,team.preferences:read,lists:read,reminders:read';
    const state = Buffer.from(JSON.stringify({
      provider: 'slack',
      userId,
      timestamp: Date.now()
    })).toString('base64');

    const authUrl = `https://slack.com/oauth/v2/authorize?` +
      `client_id=${clientId}&redirect_uri=${redirectUri}&user_scope=${userScope}&state=${state}`;

    res.json({
      success: true,
      authUrl,
      message: 'Redirect user to Slack OAuth'
    });
  } catch (error) {
    console.error('Slack connection error:', error);
    res.status(500).json({ error: 'Failed to initialize Slack connection' });
  }
});

// Discord connector
router.post('/connect/discord', async (req, res) => {
  try {
    const { userId } = req.body;

    // Discord OAuth URL
    const clientId = process.env.DISCORD_CLIENT_ID || 'your-discord-client-id';
    const redirectUri = encodeURIComponent(`${process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`);
    const scope = encodeURIComponent('identify email guilds messages.read');
    const state = Buffer.from(JSON.stringify({
      platform: 'discord',
      userId,
      timestamp: Date.now()
    })).toString('base64');

    const authUrl = `https://discord.com/api/oauth2/authorize?` +
      `client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&` +
      `response_type=code&state=${state}`;

    res.json({
      success: true,
      authUrl,
      message: 'Redirect user to Discord OAuth'
    });
  } catch (error) {
    console.error('Discord connection error:', error);
    res.status(500).json({ error: 'Failed to initialize Discord connection' });
  }
});

/**
 * OAuth Callback Handler for MCP Platforms
 * Handles OAuth callbacks for Teams, Slack, and Discord
 */
router.post('/oauth/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.body;

    if (oauthError) {
      return res.status(400).json({
        success: false,
        error: `OAuth error: ${oauthError}`
      });
    }

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        error: 'Missing authorization code or state'
      });
    }

    // Decode state to get provider and userId
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    const { provider, userId } = stateData;

    let accessToken, refreshToken, expiresIn;

    // Exchange authorization code for access token based on provider
    switch (provider) {
      case 'discord':
        const discordTokenResponse = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: `${process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`
          })
        });

        if (!discordTokenResponse.ok) {
          throw new Error('Failed to exchange Discord authorization code');
        }

        const discordTokens = await discordTokenResponse.json();
        accessToken = discordTokens.access_token;
        refreshToken = discordTokens.refresh_token;
        expiresIn = discordTokens.expires_in;
        break;

      case 'slack':
        const slackTokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.SLACK_CLIENT_ID,
            client_secret: process.env.SLACK_CLIENT_SECRET,
            code,
            redirect_uri: `${process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`
          })
        });

        if (!slackTokenResponse.ok) {
          throw new Error('Failed to exchange Slack authorization code');
        }

        const slackTokens = await slackTokenResponse.json();
        if (!slackTokens.ok) {
          throw new Error(slackTokens.error || 'Slack token exchange failed');
        }
        accessToken = slackTokens.access_token;
        // Slack v2 doesn't always return refresh token
        refreshToken = slackTokens.refresh_token;
        expiresIn = slackTokens.expires_in;
        break;

      case 'teams':
        const teamsTokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.TEAMS_CLIENT_ID,
            client_secret: process.env.TEAMS_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: `${process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`,
            scope: 'User.Read Chat.Read Channel.ReadBasic.All Files.Read.All'
          })
        });

        if (!teamsTokenResponse.ok) {
          throw new Error('Failed to exchange Teams authorization code');
        }

        const teamsTokens = await teamsTokenResponse.json();
        accessToken = teamsTokens.access_token;
        refreshToken = teamsTokens.refresh_token;
        expiresIn = teamsTokens.expires_in;
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unsupported provider: ${provider}`
        });
    }

    // TODO: Store tokens in database with encryption
    // For now, return them to the client
    res.json({
      success: true,
      provider,
      userId,
      accessToken,
      refreshToken,
      expiresIn,
      message: `Successfully connected to ${provider}`
    });

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete OAuth flow',
      details: error.message
    });
  }
});

// Extract data from Teams
router.post('/extract/teams', async (req, res) => {
  try {
    const { userId, accessToken } = req.body;

    // Get Teams messages
    const messagesResponse = await fetch('https://graph.microsoft.com/v1.0/me/chats', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!messagesResponse.ok) {
      throw new Error('Failed to fetch Teams data');
    }

    const chats = await messagesResponse.json();

    // Extract teaching patterns from Teams chats
    const patterns = await extractionService.extractTeamsPatterns(chats.value);

    res.json({
      success: true,
      patterns,
      summary: {
        totalChats: chats.value.length,
        teachingMentions: patterns.teachingMentions,
        collaborationStyle: patterns.collaborationStyle
      }
    });
  } catch (error) {
    console.error('Teams extraction error:', error);
    res.status(500).json({ error: 'Failed to extract Teams data' });
  }
});

// Extract data from Slack
router.post('/extract/slack', async (req, res) => {
  try {
    const { userId, accessToken } = req.body;

    if (!userId || !accessToken) {
      return res.status(400).json({
        success: false,
        error: 'userId and accessToken are required'
      });
    }

    // Load MCP configuration
    await mcpClient.loadConfig();

    let rawData;
    let extractionMethod = 'direct-api';

    // Try to use MCP if available
    if (mcpClient.usesMCP('slack')) {
      console.log('📊 Using MCP for Slack data extraction');
      try {
        rawData = await mcpClient.extractData('slack', accessToken, userId);
        extractionMethod = 'mcp';
      } catch (mcpError) {
        console.error('MCP extraction failed, falling back to direct API:', mcpError);
        extractionMethod = 'direct-api-fallback';
      }
    }

    // Fallback to direct Slack API if MCP not available or failed
    if (!rawData || extractionMethod !== 'mcp') {
      console.log('📊 Using direct Slack API for data extraction');

      // Get Slack conversations
      const conversationsResponse = await fetch('https://slack.com/api/conversations.list', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!conversationsResponse.ok) {
        throw new Error('Failed to fetch Slack data');
      }

      const conversations = await conversationsResponse.json();

      if (!conversations.ok) {
        throw new Error(conversations.error || 'Slack API error');
      }

      rawData = {
        platform: 'slack',
        userId,
        dataType: 'direct_api_extraction',
        extracted: {
          channels: conversations.channels || [],
          messages: [],
          reactions: [],
          communicationMetrics: {}
        },
        metadata: {
          extractedAt: new Date().toISOString(),
          method: 'direct-api',
          dataPoints: conversations.channels?.length || 0
        }
      };
    }

    // Extract patterns from Slack
    const patterns = await extractionService.extractSlackPatterns(rawData.extracted.channels);

    res.json({
      success: true,
      extractionMethod,
      patterns,
      summary: {
        totalChannels: rawData.extracted.channels.length,
        communicationStyle: patterns.communicationStyle,
        expertise: patterns.identifiedExpertise
      },
      metadata: {
        dataPoints: rawData.metadata.dataPoints,
        extractedAt: rawData.metadata.extractedAt,
        method: extractionMethod
      }
    });
  } catch (error) {
    console.error('Slack extraction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract Slack data',
      details: error.message
    });
  }
});

// Extract data from Discord
router.post('/extract/discord', async (req, res) => {
  try {
    const { userId, accessToken } = req.body;

    if (!userId || !accessToken) {
      return res.status(400).json({
        success: false,
        error: 'userId and accessToken are required'
      });
    }

    // Load MCP configuration
    await mcpClient.loadConfig();

    let rawData;
    let extractionMethod = 'direct-api';

    // Try to use MCP if available
    if (mcpClient.usesMCP('discord')) {
      console.log('📊 Using MCP for Discord data extraction');
      try {
        rawData = await mcpClient.extractData('discord', accessToken, userId);
        extractionMethod = 'mcp';
      } catch (mcpError) {
        console.error('MCP extraction failed, falling back to direct API:', mcpError);
        extractionMethod = 'direct-api-fallback';
      }
    }

    // Fallback to direct Discord API if MCP not available or failed
    if (!rawData || extractionMethod !== 'mcp') {
      console.log('📊 Using direct Discord API for data extraction');

      // Get Discord guilds
      const guildsResponse = await fetch('https://discord.com/api/v10/users/@me/guilds', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!guildsResponse.ok) {
        throw new Error('Failed to fetch Discord data');
      }

      const guilds = await guildsResponse.json();

      rawData = {
        platform: 'discord',
        userId,
        dataType: 'direct_api_extraction',
        extracted: {
          servers: guilds,
          messages: [],
          interactions: [],
          communicationStyle: {}
        },
        metadata: {
          extractedAt: new Date().toISOString(),
          method: 'direct-api',
          dataPoints: guilds.length
        }
      };
    }

    // Extract patterns from Discord
    const patterns = await extractionService.extractDiscordPatterns(rawData.extracted.servers);

    res.json({
      success: true,
      extractionMethod,
      patterns,
      summary: {
        totalGuilds: rawData.extracted.servers.length,
        communities: patterns.communities,
        engagement: patterns.engagementLevel
      },
      metadata: {
        dataPoints: rawData.metadata.dataPoints,
        extractedAt: rawData.metadata.extractedAt,
        method: extractionMethod
      }
    });
  } catch (error) {
    console.error('Discord extraction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract Discord data',
      details: error.message
    });
  }
});

// Generate instant twin from all connected sources
router.post('/generate-instant-twin', async (req, res) => {
  try {
    const { userId } = req.body;

    // Mock data for demonstration - in production, fetch from stored tokens
    const mockData = {
      gmail: {
        emailsAnalyzed: 50,
        patterns: {
          communication_style: 'Friendly and encouraging',
          response_patterns: 'Detailed explanations with examples',
          common_topics: ['programming', 'web development', 'AI']
        }
      },
      calendar: {
        eventsAnalyzed: 30,
        patterns: {
          meeting_frequency: 'Daily office hours',
          availability: 'Mornings and evenings',
          scheduling_style: 'Flexible with students'
        }
      },
      teams: {
        collaborationStyle: 'Active participant',
        expertise: ['Software Engineering', 'Machine Learning']
      },
      slack: {
        communicationStyle: 'Casual and helpful',
        responseTime: 'Quick responses'
      }
    };

    // Generate instant twin profile
    const twinProfile = await extractionService.generateInstantTwinProfile(
      mockData.gmail,
      mockData.calendar,
      { firstName: 'Demo', lastName: 'Professor' }
    );

    // Add data from other sources
    if (mockData.teams) {
      twinProfile.collaboration = mockData.teams;
    }
    if (mockData.slack) {
      twinProfile.communication = {
        ...twinProfile.communication,
        slack: mockData.slack
      };
    }

    res.json({
      success: true,
      twin: twinProfile,
      dataSources: Object.keys(mockData),
      readyToActivate: true
    });
  } catch (error) {
    console.error('Instant twin generation error:', error);
    res.status(500).json({ error: 'Failed to generate instant twin' });
  }
});

export default router;