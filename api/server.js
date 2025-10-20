import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';

// Background services
import { startTokenRefreshService } from './services/tokenRefreshService.js';
import { startPlatformPolling } from './services/platformPollingService.js';
import { initializeWebSocketServer } from './services/websocketService.js';

// Only use dotenv in development - Vercel provides env vars directly
// Updated: Fixed SUPABASE_SERVICE_ROLE_KEY truncation issue
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy - required for Vercel serverless functions
// This allows Express to correctly identify client IPs from X-Forwarded-For headers
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.anthropic.com", "https://api.openai.com"],
    },
  },
}));

// CORS configuration - more secure
const allowedOrigins = [
  process.env.VITE_APP_URL || 'http://localhost:8085',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:8083',
  'http://localhost:8084',
  'http://localhost:8085',
  'http://localhost:8086',
  'https://twin-ai-learn.vercel.app'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // Allow browser extensions (Chrome, Edge, Firefox)
    if (origin && (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://'))) {
      console.log(`✅ CORS allowing browser extension: ${origin}`);
      return callback(null, true);
    }

    // In development, allow localhost on any port
    if (process.env.NODE_ENV === 'development' && origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }

    // In production, only allow specific origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Log rejected origins for debugging
    console.warn(`CORS rejected origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200,
}));

// Rate limiting - more generous in development
const isDevelopment = process.env.NODE_ENV === 'development';
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 1000 : (parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100), // 1000 in dev, 100 in prod
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 15 * 60 * 1000
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for auth verification in development
    return isDevelopment && req.path === '/auth/verify';
  }
});

// Apply rate limiting to all API routes (except skipped ones)
app.use('/api/', apiLimiter);

// Stricter rate limiting for AI endpoints
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 AI requests per 15 minutes
  message: {
    error: 'AI request limit exceeded. Please try again later.',
    retryAfter: 15 * 60 * 1000
  },
});

app.use('/api/ai/', aiLimiter);

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Content-Type validation (exclude auth routes)
app.use((req, res, next) => {
  // Skip Content-Type validation for auth routes
  if (req.originalUrl.startsWith('/api/auth/')) {
    return next();
  }
  // Apply Content-Type validation to all other routes
  return validateContentType(['application/json', 'multipart/form-data'])(req, res, next);
});

// Input sanitization (exclude auth routes to prevent breaking authentication)
app.use('/api/', (req, res, next) => {
  // Skip sanitization for authentication routes
  if (req.originalUrl.startsWith('/api/auth/')) {
    return next();
  }
  // Apply sanitization to all other API routes
  sanitizeInput(req, res, next);
});

// Input validation middleware
const validateChatRequest = [
  body('message')
    .trim()
    .isLength({ min: 1, max: 5000 })
    .withMessage('Message must be between 1 and 5000 characters')
    .escape(), // Sanitize HTML
  body('twinId')
    .isUUID()
    .withMessage('Invalid twin ID format'),
  body('conversationId')
    .optional()
    .isUUID()
    .withMessage('Invalid conversation ID format'),
  body('context')
    .optional()
    .isObject()
    .withMessage('Context must be an object'),
  body('context.twin')
    .optional()
    .isObject()
    .withMessage('Twin context must be an object'),
  body('context.studentProfile')
    .optional()
    .isObject()
    .withMessage('Student profile must be an object'),
];

// Error handling middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Import routes
import aiRoutes from './routes/ai.js';
import documentRoutes from './routes/documents.js';
import twinsRoutes from './routes/twins.js';
import conversationsRoutes from './routes/conversations.js';
import voiceRoutes from './routes/voice.js';
import analyticsRoutes from './routes/analytics.js';
import connectorsRoutes from './routes/connectors.js';
import dataVerificationRoutes from './routes/data-verification.js';
import mcpRoutes from './routes/mcp.js';
import entertainmentRoutes from './routes/entertainment-connectors.js';
import additionalEntertainmentRoutes from './routes/additional-entertainment-connectors.js';
import soulExtractionRoutes from './routes/soul-extraction.js';
import soulDataRoutes from './routes/soul-data.js';
import authRoutes from './routes/auth-simple.js';
import oauthCallbackRoutes from './routes/oauth-callback.js';
import dashboardRoutes from './routes/dashboard.js';
import trainingRoutes from './routes/training.js';
import diagnosticsRoutes from './routes/diagnostics.js';
import dataSourcesRoutes from './routes/data-sources.js';
import allPlatformRoutes from './routes/all-platform-connectors.js';
import soulObserverRoutes from './routes/soul-observer.js';
import webhookRoutes from './routes/webhooks.js';
import sseRoutes from './routes/sse.js';
import { serverDb } from './services/database.js';
import { sanitizeInput, validateContentType } from './middleware/sanitization.js';
import { /* handleAuthError, */ handleGeneralError, handle404 } from './middleware/errorHandler.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authenticateUser } from './middleware/auth.js';

// API routes
app.use('/api/ai', aiRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/twins', twinsRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/connectors', connectorsRoutes);
app.use('/api/data-verification', dataVerificationRoutes);
app.use('/api/mcp', mcpRoutes);
app.use('/api/entertainment', entertainmentRoutes);
app.use('/api/entertainment', additionalEntertainmentRoutes);
app.use('/api/soul', soulExtractionRoutes);
app.use('/api/soul-data', soulDataRoutes);
app.use('/api/data-sources', dataSourcesRoutes);
app.use('/api/auth', authRoutes);
app.use('/oauth', oauthCallbackRoutes); // Unified OAuth callback handler
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/diagnostics', diagnosticsRoutes); // Supabase connection diagnostics
app.use('/api/platforms', allPlatformRoutes); // Comprehensive 56-platform integration
app.use('/api/soul-observer', authenticateUser, soulObserverRoutes); // Soul Observer Mode - behavioral tracking
app.use('/api/webhooks', webhookRoutes); // Real-time webhook receivers (GitHub, Gmail, Slack)
app.use('/api/sse', sseRoutes); // Server-Sent Events for real-time updates

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const dbHealth = await serverDb.healthCheck();

  res.json({
    status: dbHealth.healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: {
      connected: dbHealth.healthy,
      error: dbHealth.error?.message || null
    }
  });
});

// Authentication error handling (must be before general error handler)
// app.use(handleAuthError);

// 404 handler (must come before error handler)
app.use(notFoundHandler);

// General error handling middleware (must be last)
app.use(errorHandler);

// Start server only in development (not in Vercel serverless)
console.log(`🔍 NODE_ENV check: "${process.env.NODE_ENV}" (condition: !== 'production')`);
console.log(`🔍 Condition result: ${process.env.NODE_ENV !== 'production'}`);

if (process.env.NODE_ENV !== 'production') {
  console.log('✅ Entering development server initialization block...');
  // Create HTTP server for WebSocket support
  const server = http.createServer(app);

  // Initialize WebSocket server
  initializeWebSocketServer(server);

  // Start background services
  console.log('🔧 Initializing background services...');

  // Token refresh service - runs every 5 minutes
  startTokenRefreshService();

  // Platform polling service - platform-specific schedules
  startPlatformPolling();

  // Start HTTP server
  server.listen(PORT, () => {
    console.log(`🚀 Secure API server running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 CORS origin: ${process.env.VITE_APP_URL || 'http://localhost:8080'}`);
    console.log(`🔌 WebSocket server enabled on ws://localhost:${PORT}/ws`);
    console.log(`⏰ Background services active:`);
    console.log(`   - Token Refresh: Every 5 minutes`);
    console.log(`   - Spotify Polling: Every 30 minutes`);
    console.log(`   - YouTube Polling: Every 2 hours`);
    console.log(`   - GitHub Polling: Every 6 hours`);
    console.log(`   - Discord Polling: Every 4 hours`);
    console.log(`   - Gmail Polling: Every 1 hour`);
  });
}

export default app;
