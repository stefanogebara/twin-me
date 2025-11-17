import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import * as Sentry from '@sentry/node';

// Background services
import { startPlatformPolling } from './services/platformPollingService.js';
import { initializeWebSocketServer } from './services/websocketService.js';
import { initializeQueues } from './services/queueService.js';
import { startBackgroundJobs, stopBackgroundJobs } from './services/tokenLifecycleJob.js';
import { initializeRateLimiter, shutdownRateLimiter } from './middleware/oauthRateLimiter.js';

// Only use dotenv in development - Vercel provides env vars directly
// Updated: Fixed SUPABASE_SERVICE_ROLE_KEY truncation issue
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Sentry for error tracking (only if SENTRY_DSN is configured)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in dev
    integrations: [
      // Enable HTTP instrumentation for automatic tracing
      new Sentry.Integrations.Http({ tracing: true }),
      // Enable Express integration for automatic error capture
      new Sentry.Integrations.Express({ app }),
    ],
  });

  console.log('✅ Sentry error tracking initialized');

  // RequestHandler must be the first middleware
  app.use(Sentry.Handlers.requestHandler());

  // TracingHandler creates a trace for every incoming request
  app.use(Sentry.Handlers.tracingHandler());
} else {
  console.log('⚠️  Sentry DSN not configured - error tracking disabled');
}

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
import twinChatRoutes from './routes/twin-chat.js';
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
import soulMatchingRoutes from './routes/soul-matching.js';
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
import queueDashboardRoutes from './routes/queue-dashboard.js';
import cronTokenRefreshHandler from './routes/cron-token-refresh.js';
import cronPlatformPollingHandler from './routes/cron-platform-polling.js';
import pipedreamRoutes from './routes/pipedream.js';
import arcticRoutes from './routes/arctic-connectors.js';
import soulSignatureRoutes from './routes/soul-signature.js';
import soulInsightsRoutes from './routes/soul-insights.js';
import testExtractionRoutes from './routes/test-extraction.js';
import behavioralPatternsRoutes from './routes/behavioral-patterns.js';
import gnnPatternsRoutes from './routes/gnn-patterns.js';
import orchestratorRoutes from './routes/orchestrator.js';
import { serverDb } from './services/database.js';
import { sanitizeInput, validateContentType } from './middleware/sanitization.js';
import { /* handleAuthError, */ handleGeneralError, handle404 } from './middleware/errorHandler.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authenticateUser } from './middleware/auth.js';

// API routes
app.use('/api/ai', aiRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/twins', twinsRoutes);
app.use('/api/twin', twinChatRoutes);
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
app.use('/api/soul-matching', soulMatchingRoutes);
app.use('/api/data-sources', dataSourcesRoutes);
app.use('/api/auth', authRoutes);
app.use('/oauth', oauthCallbackRoutes); // Unified OAuth callback handler
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/diagnostics', diagnosticsRoutes); // Supabase connection diagnostics
app.use('/api/platforms', allPlatformRoutes); // Comprehensive 56-platform integration
// Soul Observer uses optional auth - allows both authenticated and unauthenticated requests
// Extension sends userId in body when not authenticated
app.use('/api/soul-observer', soulObserverRoutes); // Soul Observer Mode - behavioral tracking
app.use('/api/webhooks', webhookRoutes); // Real-time webhook receivers (GitHub, Gmail, Slack)
app.use('/api/sse', sseRoutes); // Server-Sent Events for real-time updates
app.use('/api/queues', queueDashboardRoutes); // Bull Board job queue dashboard
app.use('/api/pipedream', pipedreamRoutes); // Pipedream Connect OAuth integration
app.use('/api/arctic', arcticRoutes); // Arctic OAuth integration (Better Auth + Arctic)
app.use('/api/soul-signature', soulSignatureRoutes); // Soul Signature Analysis with Claude AI
app.use('/api/soul-insights', soulInsightsRoutes); // User-friendly insights from graph metrics
app.use('/api/test-extraction', testExtractionRoutes); // Demo data extraction endpoints
app.use('/api/behavioral-patterns', behavioralPatternsRoutes); // Cross-platform behavioral pattern recognition
app.use('/api/gnn-patterns', gnnPatternsRoutes); // GNN-based pattern detection with Neo4j and PyTorch Geometric
app.use('/api/orchestrator', orchestratorRoutes); // Multi-agent AI orchestration system (Anthropic pattern)

// Vercel Cron Job endpoints (production automation)
// These are called by Vercel Cron Jobs on schedule (configured in vercel.json)
app.use('/api/cron/token-refresh', cronTokenRefreshHandler); // Every 5 minutes
app.use('/api/cron/platform-polling', cronPlatformPollingHandler); // Every 30 minutes

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

// Sentry error handler (must be after routes but before other error handlers)
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Capture all errors with status code >= 500
      return error.status >= 500 || !error.status;
    }
  }));
}

// 404 handler (must come before error handler)
app.use(notFoundHandler);

// General error handling middleware (must be last)
app.use(errorHandler);

// Start server only in development (not in Vercel serverless)
//
// ARCHITECTURE NOTES:
// - Development: Background services (token refresh, platform polling) run via node-cron
// - Production (Vercel): Vercel Cron Jobs call HTTP endpoints instead:
//   * /api/cron/token-refresh (every 5 minutes)
//   * /api/cron/platform-polling (every 30 minutes)
// - This is necessary because Vercel serverless functions are stateless - persistent
//   cron jobs won't work. Vercel Cron calls our endpoints on schedule instead.
//
console.log(`🔍 NODE_ENV check: "${process.env.NODE_ENV}" (condition: !== 'production')`);
console.log(`🔍 Condition result: ${process.env.NODE_ENV !== 'production'}`);

if (process.env.NODE_ENV !== 'production') {
  console.log('✅ Entering development server initialization block...');
  // Create HTTP server for WebSocket support
  const server = http.createServer(app);

  // Initialize WebSocket server
  initializeWebSocketServer(server);

  // Start background services (development only)
  // In production, these are handled by Vercel Cron Jobs calling /api/cron/* endpoints
  console.log('🔧 Initializing background services (development mode)...');

  // Initialize Bull queues for background job processing
  initializeQueues();

  // Initialize OAuth rate limiting (Redis or in-memory fallback)
  await initializeRateLimiter();

  // Platform polling service - platform-specific schedules
  // Production equivalent: Vercel Cron → /api/cron/platform-polling
  startPlatformPolling();

  // Token lifecycle background jobs (token refresh + OAuth state cleanup)
  // - Token refresh: Every 5 minutes (prevents token expiration)
  // - OAuth cleanup: Every 15 minutes (removes expired/used states)
  // Production equivalent: Vercel Cron → /api/cron/token-refresh
  startBackgroundJobs();

  // Start HTTP server
  server.listen(PORT, () => {
    console.log(`🚀 Secure API server running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 CORS origin: ${process.env.VITE_APP_URL || 'http://localhost:8080'}`);
    console.log(`🔌 WebSocket server enabled on ws://localhost:${PORT}/ws`);
    console.log(`⏰ Background services active:`);
    console.log(`   - Bull Job Queue: ${process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL ? 'Enabled' : 'Disabled (using fallback)'}`);
    console.log(`   - Queue Dashboard: http://localhost:${PORT}/api/queues/dashboard`);
    console.log(`   - Token Lifecycle Jobs:`);
    console.log(`     • Token Refresh: Every 5 minutes (prevents token expiration)`);
    console.log(`     • OAuth Cleanup: Every 15 minutes (removes expired states)`);
    console.log(`   - Platform Polling:`);
    console.log(`     • Spotify: Every 30 minutes`);
    console.log(`     • YouTube: Every 2 hours`);
    console.log(`     • GitHub: Every 6 hours`);
    console.log(`     • Discord: Every 4 hours`);
    console.log(`     • Gmail: Every 1 hour`);
  });

  // Graceful shutdown handlers
  const gracefulShutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);

    // Stop background jobs first
    stopBackgroundJobs();

    // Shutdown rate limiter
    await shutdownRateLimiter();

    // Close server
    server.close(() => {
      console.log('✅ Server closed successfully');
      process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown fails
    setTimeout(() => {
      console.error('⏰ Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

export default app;
