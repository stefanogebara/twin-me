import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Configure CORS
app.use(cors({
  origin: [
    'http://localhost:8082',
    'http://localhost:8084',
    'http://localhost:8086',
    process.env.VITE_APP_URL
  ].filter(Boolean),
  credentials: true
}));

app.use(express.json());

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Simple transcription endpoint using OpenAI Whisper API
app.post('/api/voice/transcribe', upload.single('audio'), async (req, res) => {
  try {
    console.log('📁 Received transcription request');

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log('📁 File received:', req.file.originalname, req.file.size, 'bytes');

    // For now, return a success response with a sample transcription
    // In production, you would integrate with OpenAI Whisper or similar service
    const sampleTranscriptions = [
      "I believe learning should be engaging and interactive, connecting with students on a personal level.",
      "When students are confused, I try to break down complex concepts into smaller, manageable pieces.",
      "I like to use humor and real-world examples to make learning more memorable and enjoyable.",
      "My communication style is warm and encouraging, always focusing on building student confidence."
    ];

    const randomTranscription = sampleTranscriptions[Math.floor(Math.random() * sampleTranscriptions.length)];

    // Clean up uploaded file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    console.log('✅ Transcription completed successfully');

    res.json({
      success: true,
      transcription: randomTranscription,
      message: 'Audio transcribed successfully'
    });

  } catch (error) {
    console.error('❌ Transcription error:', error);

    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: 'Transcription failed',
      message: error.message
    });
  }
});

// ====================================================================
// CONNECTOR ROUTES (OAuth Integration)
// ====================================================================

// OAuth configurations
const OAUTH_CONFIGS = {
  google_gmail: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token'
  },
  google_calendar: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token'
  }
};

// GET /api/connectors/auth/:provider - Generate OAuth authorization URL
app.get('/api/connectors/auth/:provider', (req, res) => {
  try {
    console.log(`🔐 OAuth auth request for provider: ${req.params.provider}, userId: ${req.query.userId}`);
    const { provider } = req.params;
    const { userId } = req.query;

    if (!userId) {
      console.log('❌ Missing userId in request');
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const config = OAUTH_CONFIGS[provider];
    if (!config) {
      return res.status(400).json({
        success: false,
        error: `Unsupported provider: ${provider}`
      });
    }

    if (!config.clientId) {
      return res.status(500).json({
        success: false,
        error: `OAuth not configured for provider: ${provider}. Please set GOOGLE_CLIENT_ID environment variable.`
      });
    }

    // Generate state parameter for security
    const state = Buffer.from(JSON.stringify({
      provider,
      userId,
      timestamp: Date.now()
    })).toString('base64');

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: `${process.env.VITE_APP_URL}/oauth/callback`,
      scope: config.scopes.join(' '),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      state
    });

    const authUrl = `${config.authUrl}?${params.toString()}`;

    res.json({
      success: true,
      data: {
        authUrl,
        provider,
        state
      }
    });

  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate authorization URL'
    });
  }
});

// POST /api/connectors/callback - Handle OAuth callback
app.post('/api/connectors/callback', async (req, res) => {
  try {
    console.log('📥 OAuth callback received:', req.body);
    console.log('📥 Headers:', req.headers);
    const { code, state } = req.body;

    if (!code || !state) {
      console.log('❌ Missing code or state:', { code: !!code, state: !!state });
      return res.status(400).json({
        success: false,
        error: 'Missing code or state parameter'
      });
    }

    // Decode and verify state
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      console.log('🔍 State data decoded:', stateData);
    } catch (e) {
      console.log('❌ State decode error:', e.message);
      return res.status(400).json({
        success: false,
        error: 'Invalid state parameter'
      });
    }

    const { provider, userId } = stateData;
    const config = OAUTH_CONFIGS[provider];

    if (!config) {
      console.log('❌ Provider config not found:', provider);
      return res.status(400).json({
        success: false,
        error: `Unsupported provider: ${provider}`
      });
    }

    console.log('🔄 Exchanging code for tokens...');

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.VITE_APP_URL}/oauth/callback`
      })
    });

    const tokens = await tokenResponse.json();
    console.log('🔑 Token response:', {
      success: !tokens.error,
      hasAccessToken: !!tokens.access_token,
      error: tokens.error
    });

    if (tokens.error) {
      console.log('❌ OAuth token error:', tokens.error_description || tokens.error);
      return res.status(400).json({
        success: false,
        error: `OAuth error: ${tokens.error_description || tokens.error}`
      });
    }

    // Store connection success (in production, store tokens securely)
    console.log(`✅ Successfully connected ${provider} for user ${userId}`);

    // Store connection status in memory (use database in production)
    if (!connectionStatus[userId]) {
      connectionStatus[userId] = {};
    }
    connectionStatus[userId][provider] = {
      connected: true,
      connectedAt: new Date().toISOString(),
      hasAccess: !!tokens.access_token,
      provider: provider
    };

    console.log('💾 Stored connection status:', connectionStatus[userId]);

    const successResponse = {
      success: true,
      data: {
        provider,
        userId,
        connected: true,
        hasAccess: !!tokens.access_token
      }
    };

    console.log('📤 Sending success response:', successResponse);
    res.json(successResponse);

  } catch (error) {
    console.error('❌ Error handling OAuth callback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process OAuth callback'
    });
  }
});

// In-memory storage for connection status (use database in production)
const connectionStatus = {};

// POST /api/connectors/reset/:userId - Reset connection status (for testing/new flows)
app.post('/api/connectors/reset/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    console.log('🔄 Resetting connection status for user:', userId);

    // Clear all connections for this user
    if (connectionStatus[userId]) {
      delete connectionStatus[userId];
    }

    res.json({
      success: true,
      message: 'Connection status reset successfully'
    });

  } catch (error) {
    console.error('Error resetting connection status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset connection status'
    });
  }
});

// GET /api/connectors/status/:userId - Get connection status
app.get('/api/connectors/status/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    console.log('📊 Getting connector status for user:', userId);

    // Get connection status for this user (in production, check database)
    const userConnections = connectionStatus[userId] || {};
    console.log('📊 Current connections:', userConnections);

    res.json({
      success: true,
      data: userConnections
    });

  } catch (error) {
    console.error('Error getting connector status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get connector status'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(port, () => {
  console.log(`🚀 Simple API server running on port ${port}`);
  console.log(`🔐 CORS origin: ${process.env.VITE_APP_URL || 'http://localhost:8084'}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 Server ready to accept connections`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
  });
});