import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import * as Sentry from '@sentry/node';

// Background services — loaded dynamically in the dev-only block below
// (Bull, Redis, WebSocket, node-cron are not needed in Vercel serverless)

// Only use dotenv in development - Vercel provides env vars directly
// Updated: Fixed SUPABASE_SERVICE_ROLE_KEY truncation issue
// Hot reload trigger: 2026-02-03T00:02 - Cron Claude Sync routes added
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
} else if (process.env.NODE_ENV === 'production') {
  // Only warn in production - in development, Sentry is typically not needed
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
  'http://127.0.0.1:8086',
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

    // In development, allow localhost and 127.0.0.1 on any port
    if (process.env.NODE_ENV === 'development' && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
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
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
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

// Lazy route loader — module is imported on first request, then cached by Node
function lazy(loader) {
  let mod;
  return async (req, res, next) => {
    if (!mod) mod = (await loader()).default;
    mod(req, res, next);
  };
}

import { supabaseAdmin } from './services/database.js';
import { sanitizeInput, validateContentType } from './middleware/sanitization.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';

// System health check endpoint (4A - Production Hardening)
app.get('/api/system/health', async (req, res) => {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: { connected: false },
    memoryStreamCount: 0,
    ingestionLastRun: null,
    llmCallsLastHour: 0,
  };

  try {
    // 1. Database connectivity check (SELECT 1 equivalent)
    if (!supabaseAdmin) {
      checks.database.connected = false;
      checks.database.error = 'supabaseAdmin not initialized';
    } else {
      const { error: dbError } = await supabaseAdmin
        .from('users')
        .select('id')
        .limit(1);
      checks.database.connected = !dbError;
      if (dbError) checks.database.error = dbError.message;
    }
  } catch (e) {
    checks.database.connected = false;
    checks.database.error = e.message;
  }

  // If database is not connected, return 503 early
  if (!checks.database.connected) {
    checks.status = 'unhealthy';
    return res.status(503).json(checks);
  }

  try {
    // 2. Memory stream count
    const { count, error: memError } = await supabaseAdmin
      .from('user_memories')
      .select('*', { count: 'exact', head: true });
    if (!memError) checks.memoryStreamCount = count || 0;

    // 3. Ingestion last-run
    const { data: lastRun, error: ingError } = await supabaseAdmin
      .from('ingestion_health_log')
      .select('run_at, duration_ms, users_processed, observations_stored, errors')
      .order('run_at', { ascending: false })
      .limit(1)
      .single();
    if (!ingError && lastRun) checks.ingestionLastRun = lastRun;

    // 4. LLM calls last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: llmCount, error: llmError } = await supabaseAdmin
      .from('llm_usage_log')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneHourAgo);
    if (!llmError) checks.llmCallsLastHour = llmCount || 0;
  } catch (e) {
    // Non-fatal: database is connected but some queries failed
    checks.queryError = e.message;
  }

  res.status(200).json(checks);
});

// API routes — lazy-loaded on first request instead of on cold start
app.use('/api/ai', lazy(() => import('./routes/ai.js')));
app.use('/api/documents', lazy(() => import('./routes/documents.js')));
app.use('/api/twins', lazy(() => import('./routes/twins.js')));
app.use('/api/twin', lazy(() => import('./routes/twin-chat.js')));
app.use('/api/chat', lazy(() => import('./routes/twin-chat.js')));
app.use('/api/chat', lazy(() => import('./routes/chat-usage.js')));
app.use('/api/conversations', lazy(() => import('./routes/conversations.js')));
app.use('/api/voice', lazy(() => import('./routes/voice.js')));
app.use('/api/analytics', lazy(() => import('./routes/analytics.js')));
app.use('/api/connectors', lazy(() => import('./routes/connectors.js')));
app.use('/api/data-verification', lazy(() => import('./routes/data-verification.js')));
app.use('/api/mcp', lazy(() => import('./routes/mcp.js')));
app.use('/api/entertainment', lazy(() => import('./routes/entertainment-connectors.js')));
app.use('/api/entertainment', lazy(() => import('./routes/additional-entertainment-connectors.js')));
app.use('/api/health', lazy(() => import('./routes/health-connectors.js')));
app.use('/api/wearables', lazy(() => import('./routes/wearable-connectors.js')));
app.use('/api/soul', lazy(() => import('./routes/soul-extraction.js')));
app.use('/api/soul-data', lazy(() => import('./routes/soul-data.js')));
app.use('/api/soul-matching', lazy(() => import('./routes/soul-matching.js')));
app.use('/api/data-sources', lazy(() => import('./routes/data-sources.js')));
app.use('/api/auth', lazy(() => import('./routes/auth-simple.js')));
app.use('/oauth', lazy(() => import('./routes/oauth-callback.js')));
app.use('/api/dashboard', lazy(() => import('./routes/dashboard.js')));
app.use('/api/training', lazy(() => import('./routes/training.js')));
app.use('/api/diagnostics', lazy(() => import('./routes/diagnostics.js')));
app.use('/api/platforms', lazy(() => import('./routes/all-platform-connectors.js')));
app.use('/api/soul-observer', lazy(() => import('./routes/soul-observer.js')));
app.use('/api/webhooks', lazy(() => import('./routes/webhooks.js')));
app.use('/api/webhooks/whoop', lazy(() => import('./routes/whoop-webhooks.js')));
app.use('/api/sse', lazy(() => import('./routes/sse.js')));
app.use('/api/queues', lazy(() => import('./routes/queue-dashboard.js')));
app.use('/api/pipedream', lazy(() => import('./routes/pipedream.js')));
app.use('/api/arctic', lazy(() => import('./routes/arctic-connectors.js')));
app.use('/api/soul-signature', lazy(() => import('./routes/soul-signature.js')));
app.use('/api/soul-insights', lazy(() => import('./routes/soul-insights.js')));
if (process.env.NODE_ENV === 'development') {
  app.use('/api/test-extraction', lazy(() => import('./routes/test-extraction.js')));
}
app.use('/api/behavioral-patterns', lazy(() => import('./routes/behavioral-patterns.js')));
app.use('/api/orchestrator', lazy(() => import('./routes/orchestrator.js')));
app.use('/api/oauth/calendar', lazy(() => import('./routes/calendar-oauth.js')));
app.use('/api/calendar', lazy(() => import('./routes/calendar-oauth.js')));
app.use('/api/oauth/spotify', lazy(() => import('./routes/spotify-oauth.js')));
app.use('/api/spotify', lazy(() => import('./routes/spotify-oauth.js')));
app.use('/api/presentation-ritual', lazy(() => import('./routes/presentation-ritual.js')));
app.use('/api/twin', lazy(() => import('./routes/intelligent-twin.js')));
if (process.env.NODE_ENV === 'development') {
  app.use('/api/test-pattern-learning', lazy(() => import('./routes/test-pattern-learning.js')));
}
app.use('/api/onboarding', lazy(() => import('./routes/onboarding-questions.js')));
app.use('/api/onboarding', lazy(() => import('./routes/onboarding-calibration.js')));
app.use('/api/onboarding', lazy(() => import('./routes/onboarding-soul-signature.js')));
app.use('/api/onboarding', lazy(() => import('./routes/onboarding-platform-preview.js')));
app.use('/api/account', lazy(() => import('./routes/account.js')));
app.use('/api/consent', lazy(() => import('./routes/consent.js')));
app.use('/api/soul-signature', lazy(() => import('./routes/soul-signature-public.js')));
app.use('/api', lazy(() => import('./routes/og-image.js')));
app.use('/api/personality', lazy(() => import('./routes/personality-assessment.js')));
app.use('/api/big-five', lazy(() => import('./routes/big-five.js')));
app.use('/api/insights', lazy(() => import('./routes/platform-insights.js')));
app.use('/api/twin', lazy(() => import('./routes/twin-pipeline.js')));
app.use('/api/extraction', lazy(() => import('./routes/extraction-status.js')));
app.use('/api/notifications', lazy(() => import('./routes/notifications.js')));
app.use('/api/research-rag', lazy(() => import('./routes/research-rag.js')));
app.use('/api/personality-inference', lazy(() => import('./routes/personality-inference.js')));
app.use('/api/origin', lazy(() => import('./routes/origin-data.js')));
app.use('/api/enrichment', lazy(() => import('./routes/profile-enrichment.js')));
app.use('/api/resume', lazy(() => import('./routes/resume-upload.js')));
app.use('/api/keys', lazy(() => import('./routes/api-keys.js')));
app.use('/api/mcp-api', lazy(() => import('./routes/mcp-api.js')));
app.use('/api/claude-sync', lazy(() => import('./routes/claude-sync.js')));
app.use('/api/cron/claude-sync', lazy(() => import('./routes/cron-claude-sync.js')));
app.use('/api/twins-brain', lazy(() => import('./routes/twins-brain.js')));
app.use('/api/mem0', lazy(() => import('./routes/mem0.js')));
app.use('/api/mem0-sync', lazy(() => import('./routes/mem0-brain-sync.js')));
app.use('/api/correlations', lazy(() => import('./routes/correlations.js')));
app.use('/api/nango', lazy(() => import('./routes/nango.js')));
app.use('/api/nango-webhooks', lazy(() => import('./routes/nango-webhooks.js')));
app.use('/api/extension', lazy(() => import('./routes/extension-data.js')));
app.use('/api/journal', lazy(() => import('./routes/journal.js')));
app.use('/api/admin', lazy(() => import('./routes/admin-llm-costs.js')));

// Vercel Cron Job endpoints (lazy-loaded like all other routes)
app.use('/api/cron/token-refresh', lazy(() => import('./routes/cron-token-refresh.js')));
app.use('/api/cron/platform-polling', lazy(() => import('./routes/cron-platform-polling.js')));
app.use('/api/cron/pattern-learning', lazy(() => import('./routes/cron-pattern-learning.js')));
app.use('/api/cron/ingest-observations', lazy(() => import('./routes/cron-observation-ingestion.js')));

// Health check endpoint — lightweight, no DB call (proves the function is alive)
// For detailed checks, use /api/system/health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// TEMPORARY: Test endpoint to trigger evidence pipeline (for debugging)
// SECURITY FIX: Only available in development mode
if (process.env.NODE_ENV === 'development') {
  app.get('/api/test-evidence-pipeline/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      console.log(`🧪 [Test] Triggering evidence pipeline for user ${userId}`);
      const { default: behavioralEvidencePipeline } = await import('./services/behavioralEvidencePipeline.js');
      const result = await behavioralEvidencePipeline.runPipeline(userId);
      res.json(result);
    } catch (error) {
      console.error('Test pipeline error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}

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

  // Dynamically import background services (avoids loading Bull, Redis, WebSocket, node-cron at module level)
  const { initializeWebSocketServer } = await import('./services/websocketService.js');
  const { initializeQueues } = await import('./services/queueService.js');
  const { initializeRateLimiter, shutdownRateLimiter } = await import('./middleware/oauthRateLimiter.js');
  const { startPlatformPolling } = await import('./services/platformPollingService.js');
  const { startBackgroundJobs, stopBackgroundJobs } = await import('./services/tokenLifecycleJob.js');
  const { startPatternLearningJob, stopPatternLearningJob } = await import('./services/patternLearningJob.js');
  const { startTokenExpiryNotifier, stopTokenExpiryNotifier } = await import('./services/tokenExpiryNotifier.js');
  const { startObservationIngestion, stopObservationIngestion } = await import('./services/observationIngestion.js');

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
  startPlatformPolling();

  // Token lifecycle background jobs (token refresh + OAuth state cleanup)
  startBackgroundJobs();

  // Pattern learning job (feedback processing + insight generation)
  startPatternLearningJob();

  // Token expiry notification service
  startTokenExpiryNotifier();

  // Observation ingestion service
  startObservationIngestion();

  // Start HTTP server
  server.listen(PORT, () => {
    console.log(`🚀 Secure API server running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 CORS origin: ${process.env.VITE_APP_URL || 'http://localhost:8080'}`);
    console.log(`🔌 WebSocket server enabled on ws://localhost:${PORT}/ws`);
    console.log(`⏰ Background services active`);
  });

  // Graceful shutdown handlers
  const gracefulShutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);

    // Stop background jobs first
    stopBackgroundJobs();
    stopPatternLearningJob();
    stopTokenExpiryNotifier();
    stopObservationIngestion();

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

  // Handle unhandled promise rejections to prevent server crashes
  process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Promise Rejection:', reason);
    console.error('Promise:', promise);
    // Don't exit - just log and continue
  });

  process.on('uncaughtException', (error) => {
    console.error('⚠️ Uncaught Exception:', error);
    // For uncaught exceptions, we should exit as the app might be in an inconsistent state
    // But give time for logging
    setTimeout(() => process.exit(1), 1000);
  });

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

export default app;





