import express from 'express';
import { DataExtractionService } from '../services/dataExtraction.js';

const router = express.Router();
const extractionService = new DataExtractionService();

// Microsoft Teams connector
router.post('/connect/teams', async (req, res) => {
  try {
    const { userId } = req.body;

    // Microsoft Teams OAuth URL
    const clientId = process.env.TEAMS_CLIENT_ID || 'your-teams-client-id';
    const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`);
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

    // Slack OAuth URL
    const clientId = process.env.SLACK_CLIENT_ID || 'your-slack-client-id';
    const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`);
    const scope = 'channels:history,channels:read,chat:write,files:read,groups:read,im:read,mpim:read,users:read';
    const state = Buffer.from(JSON.stringify({
      provider: 'slack',
      userId,
      timestamp: Date.now()
    })).toString('base64');

    const authUrl = `https://slack.com/oauth/v2/authorize?` +
      `client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;

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
    const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`);
    const scope = encodeURIComponent('identify email guilds messages.read');
    const state = Buffer.from(JSON.stringify({
      provider: 'discord',
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

    // Get Slack conversations
    const conversationsResponse = await fetch('https://slack.com/api/conversations.list', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!conversationsResponse.ok) {
      throw new Error('Failed to fetch Slack data');
    }

    const conversations = await conversationsResponse.json();

    // Extract patterns from Slack
    const patterns = await extractionService.extractSlackPatterns(conversations.channels);

    res.json({
      success: true,
      patterns,
      summary: {
        totalChannels: conversations.channels.length,
        communicationStyle: patterns.communicationStyle,
        expertise: patterns.identifiedExpertise
      }
    });
  } catch (error) {
    console.error('Slack extraction error:', error);
    res.status(500).json({ error: 'Failed to extract Slack data' });
  }
});

// Extract data from Discord
router.post('/extract/discord', async (req, res) => {
  try {
    const { userId, accessToken } = req.body;

    // Get Discord guilds
    const guildsResponse = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!guildsResponse.ok) {
      throw new Error('Failed to fetch Discord data');
    }

    const guilds = await guildsResponse.json();

    // Extract patterns from Discord
    const patterns = await extractionService.extractDiscordPatterns(guilds);

    res.json({
      success: true,
      patterns,
      summary: {
        totalGuilds: guilds.length,
        communities: patterns.communities,
        engagement: patterns.engagementLevel
      }
    });
  } catch (error) {
    console.error('Discord extraction error:', error);
    res.status(500).json({ error: 'Failed to extract Discord data' });
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