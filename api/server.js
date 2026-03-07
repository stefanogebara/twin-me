import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import https from 'https';
import * as Sentry from '@sentry/node';

// Increase default max sockets to prevent background jobs from blocking API requests
http.globalAgent.maxSockets = 50;
https.globalAgent.maxSockets = 50;

// Background services
import { startPlatformPolling } from './services/platformPollingService.js';
import { initializeWebSocketServer } from './services/websocketService.js';
import { initializeQueues } from './services/queueService.js';
import { startBackgroundJobs, stopBackgroundJobs } from './services/tokenLifecycleJob.js';
import { startPatternLearningJob, stopPatternLearningJob } from './services/patternLearningJob.js';
import { startTokenExpiryNotifier, stopTokenExpiryNotifier } from './services/tokenExpiryNotifier.js';
import { initializeRateLimiter, shutdownRateLimiter } from './middleware/oauthRateLimiter.js';
import behavioralEvidencePipeline from './services/behavioralEvidencePipeline.js';
import { startObservationIngestion, stopObservationIngestion } from './services/observationIngestion.js';

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

    // Allow specific browser extensions (by ID)
    if (origin && (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://'))) {
      const allowedExtensionIds = (process.env.ALLOWED_EXTENSION_IDS || '').split(',').filter(Boolean);
      if (allowedExtensionIds.length === 0 && process.env.NODE_ENV === 'development') {
        // In development, allow all extensions if no specific IDs configured
        return callback(null, true);
      }
      const extensionId = origin.split('://')[1];
      if (allowedExtensionIds.includes(extensionId)) {
        return callback(null, true);
      }
      console.warn(`CORS rejected browser extension: ${origin}`);
      return callback(new Error('Extension not allowed'));
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

// Stricter rate limiting for authentication endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply auth rate limiter before general API limiter
app.use('/api/auth/signin', authLimiter);
app.use('/api/auth/signup', authLimiter);

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
app.use('/api/chat/', aiLimiter); // Twin chat is the most expensive AI endpoint
app.use('/api/soul-extraction/', aiLimiter); // LLM-powered extraction endpoints

// Global request timeout to prevent hanging on DB outages
// Longer timeout in dev when Cloudflare workaround adds latency per query
const DEFAULT_TIMEOUT = process.env.USE_CURL_FETCH === 'true' ? 120000 : 30000;
app.use((req, res, next) => {
  // Chat and cron endpoints need extra time; default 30s for all others
  const timeout = req.path.includes('/chat/message') ? 300000
    : req.path.includes('/cron/') ? 115000
    : DEFAULT_TIMEOUT;
  req.setTimeout(timeout);
  res.setTimeout(timeout, () => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'Request timeout - database may be unavailable' });
    }
  });
  next();
});

// Billing webhook needs raw body — mount BEFORE express.json
app.use('/api/billing', billingRoutes);

// Parse text/plain bodies for WhatsApp import (must be before express.json so the stream isn't consumed)
app.use('/api/whatsapp/import', express.text({ limit: '10mb', type: 'text/plain' }));

// Parse JSON bodies
app.use(express.json({ limit: '100kb' }));

// Content-Type validation (exclude auth routes and WhatsApp import which uses text/plain)
app.use((req, res, next) => {
  // Skip Content-Type validation for auth routes
  if (req.originalUrl.startsWith('/api/auth/')) {
    return next();
  }
  // WhatsApp import accepts text/plain chat exports
  if (req.originalUrl.startsWith('/api/whatsapp/import')) {
    return validateContentType(['application/json', 'multipart/form-data', 'text/plain'])(req, res, next);
  }
  // Apply Content-Type validation to all other routes
  return validateContentType(['application/json', 'multipart/form-data'])(req, res, next);
});

// Input sanitization for all API routes (including auth)
app.use('/api/', sanitizeInput);

// Note: validateChatRequest / handleValidationErrors are defined per-route in
// api/routes/ai.js (which handles /api/ai/chat). Twin-chat (/api/chat/message)
// has its own inline validation. No middleware needed at the server level.

// Import routes
import aiRoutes from './routes/ai.js';
import documentRoutes from './routes/documents.js';
import twinsRoutes from './routes/twins.js';
import twinPortraitRoutes from './routes/twin-portrait.js';
import twinChatRoutes from './routes/twin-chat.js';
import twinFirstMessageRoutes from './routes/twin-first-message.js';
import chatUsageRoutes from './routes/chat-usage.js';
import conversationsRoutes from './routes/conversations.js';
import voiceRoutes from './routes/voice.js';
import analyticsRoutes from './routes/analytics.js';
import connectorsRoutes from './routes/connectors.js';
import dataVerificationRoutes from './routes/data-verification.js';
import mcpRoutes from './routes/mcp.js';
import entertainmentRoutes from './routes/entertainment-connectors.js';
import additionalEntertainmentRoutes from './routes/additional-entertainment-connectors.js';
import soulExtractionRoutes from './routes/soul-extraction.js';
import authRoutes from './routes/auth-simple.js';
import oauthCallbackRoutes from './routes/oauth-callback.js';
import dashboardRoutes from './routes/dashboard.js';
import dataSourcesRoutes from './routes/data-sources.js';
import webhookRoutes from './routes/webhooks.js';
import sseRoutes from './routes/sse.js';
import queueDashboardRoutes from './routes/queue-dashboard.js';
import cronTokenRefreshHandler from './routes/cron-token-refresh.js';
import cronPlatformPollingHandler from './routes/cron-platform-polling.js';
import cronPatternLearningHandler from './routes/cron-pattern-learning.js';
import cronObservationIngestionHandler from './routes/cron-observation-ingestion.js';
import soulSignatureRoutes from './routes/soul-signature.js';
import soulInsightsRoutes from './routes/soul-insights.js';
import testExtractionRoutes from './routes/test-extraction.js';
import calendarOAuthRoutes from './routes/calendar-oauth.js';
import spotifyOAuthRoutes from './routes/spotify-oauth.js';
import intelligentTwinRoutes from './routes/intelligent-twin.js';
import testPatternLearningRoutes from './routes/test-pattern-learning.js';
import onboardingQuestionsRoutes from './routes/onboarding-questions.js';
import personalityAssessmentRoutes from './routes/personality-assessment.js';
import bigFiveRoutes from './routes/big-five.js';
import platformInsightsRoutes from './routes/platform-insights.js';
import twinPipelineRoutes from './routes/twin-pipeline.js';
import notificationsRoutes from './routes/notifications.js';
import deviceTokensRoutes from './routes/device-tokens.js';
import extractionStatusRoutes from './routes/extraction-status.js';
import profileEnrichmentRoutes from './routes/profile-enrichment.js';
import resumeUploadRoutes from './routes/resume-upload.js';
import claudeSyncRoutes from './routes/claude-sync.js';
import cronClaudeSyncRoutes from './routes/cron-claude-sync.js';
import twinsBrainRoutes from './routes/twins-brain.js';
import mem0Routes from './routes/mem0.js';
import mem0BrainSyncRoutes from './routes/mem0-brain-sync.js';
import correlationsRoutes from './routes/correlations.js';
import nangoRoutes from './routes/nango.js';
import nangoWebhooksRoutes from './routes/nango-webhooks.js';
import extensionDataRoutes from './routes/extension-data.js';
import journalRoutes from './routes/journal.js';
import adminLlmCostsRoutes from './routes/admin-llm-costs.js';
import onboardingCalibrationRoutes from './routes/onboarding-calibration.js';
import onboardingSoulSignatureRoutes from './routes/onboarding-soul-signature.js';
import onboardingPlatformPreviewRoutes from './routes/onboarding-platform-preview.js';
import accountRoutes from './routes/account.js';
import consentRoutes from './routes/consent.js';
import privacySettingsRoutes from './routes/privacy-settings.js';
import soulSignaturePublicRoutes from './routes/soul-signature-public.js';
import portfolioPublicRoutes from './routes/portfolio-public.js';
import goalsRoutes from './routes/goals.js';
import checkinRoutes from './routes/checkin.js';
import importsRoutes from './routes/imports.js';
import cronMemoryArchiveRoutes from './routes/cron-memory-archive.js';
import cronMemoryForgettingRoutes from './routes/cron-memory-forgetting.js';
import cronPersonalityEvalRoutes from './routes/cron-personality-eval.js';
import memoryHealthRoutes from './routes/memory-health.js';
import memoryLinksRoutes from './routes/memory-links.js';
import githubConnectRoutes from './routes/github-connect.js';
import whatsappImportRoutes from './routes/whatsapp-import.js';
import evalRoutes from './routes/eval.js';
import twinIdentityRoutes from './routes/twin-identity.js';
import locationRoutes from './routes/location.js';
import billingRoutes from './routes/billing.js';
import discoveryRoutes from './routes/discovery.js';
import cronEmailDigestHandler from './routes/cron-email-digest.js';
import emailUnsubscribeRoutes from './routes/email-unsubscribe.js';
// OG image routes loaded lazily to prevent font-loading crashes from taking down the whole server
let ogImageRoutes = null;
try {
  ogImageRoutes = (await import('./routes/og-image.js')).default;
} catch (err) {
  console.warn('[OG Image] Failed to load OG image routes:', err.message);
}
import { serverDb, supabaseAdmin } from './services/database.js';
import { sanitizeInput, validateContentType } from './middleware/sanitization.js';
import { /* handleAuthError, */ handleGeneralError, handle404 } from './middleware/errorHandler.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authenticateUser } from './middleware/auth.js';

// Health check cache: avoid hammering Supabase on every uptime probe
let _healthCache = null;
let _healthCacheAt = 0;
const HEALTH_CACHE_TTL_MS = 30_000; // 30 seconds

// System health check endpoint (4A - Production Hardening)
app.get('/api/system/health', authenticateUser, async (req, res) => {
  // Return cached result if fresh enough
  if (_healthCache && (Date.now() - _healthCacheAt) < HEALTH_CACHE_TTL_MS) {
    return res.status(_healthCache.status === 'unhealthy' ? 503 : 200).json(_healthCache);
  }

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
    // 1. Database connectivity — use user_memories (lighter; avoids users table churn)
    if (!supabaseAdmin) {
      checks.database.connected = false;
      checks.database.error = 'supabaseAdmin not initialized';
    } else {
      const { error: dbError } = await supabaseAdmin
        .from('user_memories')
        .select('id')
        .limit(1);
      checks.database.connected = !dbError;
      if (dbError) checks.database.error = dbError.message;
    }
  } catch (e) {
    checks.database.connected = false;
    checks.database.error = e.message;
  }

  // If database is not connected, cache the unhealthy result and return 503
  if (!checks.database.connected) {
    checks.status = 'unhealthy';
    _healthCache = checks;
    _healthCacheAt = Date.now();
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

  _healthCache = checks;
  _healthCacheAt = Date.now();
  res.status(200).json(checks);
});

// API routes
app.use('/api/ai', aiRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/twins', twinsRoutes);
app.use('/api/twin', twinPortraitRoutes); // Twin portrait for Soul Signature page
app.use('/api/twin', twinFirstMessageRoutes); // Twin first message (GET /api/twin/first-message)
app.use('/api/twin', twinChatRoutes); // Legacy placeholder
app.use('/api/chat', twinChatRoutes); // Chat with Twin endpoint (POST /api/chat/message)
app.use('/api/chat', chatUsageRoutes); // Chat usage tracking (GET /api/chat/usage)
app.use('/api/conversations', conversationsRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/connectors', connectorsRoutes);
app.use('/api/data-verification', dataVerificationRoutes);
app.use('/api/mcp', mcpRoutes);
// Both entertainment routers intentionally share the /api/entertainment path;
// Express merges their handlers under the same mount point.
app.use('/api/entertainment', entertainmentRoutes);
app.use('/api/entertainment', additionalEntertainmentRoutes);
app.use('/api/soul', soulExtractionRoutes);
app.use('/api/data-sources', dataSourcesRoutes);
app.use('/api/auth', authRoutes);
app.use('/oauth', oauthCallbackRoutes); // Unified OAuth callback handler
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/webhooks', webhookRoutes); // Real-time webhook receivers (GitHub, Gmail, Slack)
app.use('/api/sse', sseRoutes); // Server-Sent Events for real-time updates
app.use('/api/queues', queueDashboardRoutes); // Bull Board job queue dashboard
app.use('/api/soul-signature', soulSignatureRoutes); // Soul Signature Analysis with Claude AI
app.use('/api/soul-insights', soulInsightsRoutes); // User-friendly insights from graph metrics
// Test/debug routes - only available in development
if (process.env.NODE_ENV === 'development') {
  app.use('/api/test-extraction', testExtractionRoutes); // Demo data extraction endpoints
}
app.use('/api/oauth/calendar', calendarOAuthRoutes); // Google Calendar OAuth connect endpoint
app.use('/api/calendar', calendarOAuthRoutes); // Calendar events and sync endpoints
app.use('/api/oauth/spotify', spotifyOAuthRoutes); // Spotify OAuth connect endpoint (Ritual feature)
app.use('/api/spotify', spotifyOAuthRoutes); // Spotify playback and playlist endpoints
app.use('/api/twin', intelligentTwinRoutes); // Intelligent Twin Engine routes (context, today-insights, music)
if (process.env.NODE_ENV === 'development') {
  app.use('/api/test-pattern-learning', testPatternLearningRoutes); // Pattern learning test/debug endpoints
}
app.use('/api/onboarding', onboardingQuestionsRoutes); // Personality questionnaire for personalization
app.use('/api/onboarding', onboardingCalibrationRoutes); // AI-driven calibration Q&A for cofounder.co-style onboarding
app.use('/api/onboarding', onboardingSoulSignatureRoutes); // Instant soul signature from enrichment + calibration
app.use('/api/onboarding', onboardingPlatformPreviewRoutes); // Platform preview insights during onboarding
app.use('/api/account', accountRoutes); // Account deletion + data export
app.use('/api/consent', consentRoutes); // User consent management (GDPR/privacy)
app.use('/api/privacy-settings', privacySettingsRoutes); // Privacy spectrum dashboard
app.use('/api/soul-signature', soulSignaturePublicRoutes); // Public share + visibility toggle
app.use('/api/portfolio', portfolioPublicRoutes); // Public portfolio page aggregated endpoint
if (ogImageRoutes) app.use('/api', ogImageRoutes); // OG image cards (/api/og/soul-card, /api/s/:userId)
app.use('/api/personality', personalityAssessmentRoutes); // Big Five personality assessment with 16personalities archetypes
app.use('/api/big-five', bigFiveRoutes); // IPIP-NEO-120 Big Five assessment with T-score normalization
app.use('/api/insights', platformInsightsRoutes); // Platform-specific conversational insights
app.use('/api/goals', goalsRoutes); // Twin-driven goal tracking (suggestions, progress, accountability)
app.use('/api/checkin', checkinRoutes); // Daily mood check-in (50 moods)
app.use('/api/twin', twinPipelineRoutes); // Twin formation pipeline (form, status, profile, evolution)
app.use('/api/extraction', extractionStatusRoutes); // Extraction status and job history
app.use('/api/notifications', notificationsRoutes); // User notifications (token expiry, sync issues)
app.use('/api/device-tokens', deviceTokensRoutes);  // FCM/Expo push token registration
app.use('/api/enrichment', profileEnrichmentRoutes); // Profile enrichment via Perplexity Sonar (enrichment-first onboarding)
app.use('/api/resume', resumeUploadRoutes); // Resume/CV upload and parsing for enrichment
app.use('/api/imports', importsRoutes); // GDPR / platform data export ingestion
app.use('/api/claude-sync', claudeSyncRoutes); // Claude Desktop conversation sync
app.use('/api/cron/claude-sync', cronClaudeSyncRoutes); // Claude Desktop cron sync and AI analysis processing
app.use('/api/cron/memory-archive', cronMemoryArchiveRoutes);    // Daily memory archival for large users
app.use('/api/cron/memory-forgetting', cronMemoryForgettingRoutes); // Weekly multi-tier quality maintenance
app.use('/api/cron/personality-eval', cronPersonalityEvalRoutes);   // Weekly personality assessment (Sunday 4am)
app.use('/api/memory-health', memoryHealthRoutes); // Memory stream health dashboard
// Personality assessment history (inline — small enough not to need its own route file)
app.get('/api/personality/history', authenticateUser, async (req, res) => {
  try {
    const { getPersonalityHistory } = await import('./services/personalityEvaluationService.js');
    const history = await getPersonalityHistory(req.user.id, parseInt(req.query.limit) || 12);
    res.json({ success: true, assessments: history });
  } catch (err) {
    console.error('[Personality] History fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch personality history' });
  }
});
app.use('/api/memory/:memoryId', memoryLinksRoutes); // A-MEM Zettelkasten memory links
app.use('/api/eval', evalRoutes); // Twin eval rubric + feature flags
app.use('/api/twin', twinIdentityRoutes); // Who You Are identity explorer
app.use('/api/twins-brain', twinsBrainRoutes); // Twins Brain unified knowledge graph
app.use('/api/mem0', mem0Routes); // Mem0 intelligent memory layer
app.use('/api/mem0-sync', mem0BrainSyncRoutes); // Mem0 → Twins Brain sync
app.use('/api/correlations', correlationsRoutes); // Cross-platform correlation detection (X Phoenix-inspired)
app.use('/api/nango', nangoRoutes); // Nango unified API for 10 platform connections
app.use('/api/nango-webhooks', nangoWebhooksRoutes); // Nango webhook receiver
app.use('/api/extension', extensionDataRoutes); // Browser extension data capture (YouTube, Twitch, Netflix)
app.use('/api/github', githubConnectRoutes);   // GitHub PAT connection + status
app.use('/api/whatsapp', whatsappImportRoutes); // WhatsApp export file parser
app.use('/api/journal', journalRoutes); // Soul Journal - personal journaling with AI analysis
app.use('/api/admin', adminLlmCostsRoutes); // LLM cost tracking dashboard
app.use('/api/location', locationRoutes); // Location clusters — privacy-first lifestyle signals
app.use('/api/discovery', discoveryRoutes); // Public pre-signup discovery scan
app.use('/api/cron/email-digest', cronEmailDigestHandler); // Weekly email digest (Mondays 9am)
app.use('/api/email', emailUnsubscribeRoutes); // One-click unsubscribe for digest emails

// Vercel Cron Job endpoints (production automation)
// These are called by Vercel Cron Jobs on schedule (configured in vercel.json)
app.use('/api/cron/token-refresh', cronTokenRefreshHandler); // Every 5 minutes
app.use('/api/cron/platform-polling', cronPlatformPollingHandler); // Every 30 minutes
app.use('/api/cron/pattern-learning', cronPatternLearningHandler); // Every 6 hours
app.use('/api/cron/ingest-observations', cronObservationIngestionHandler); // Every 30 minutes

// Health check endpoint (non-blocking with timeout)
app.get('/api/health', async (req, res) => {
  let dbHealth = { healthy: false, error: null };
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DB health check timeout')), 3000)
    );
    dbHealth = await Promise.race([serverDb.healthCheck(), timeout]);
  } catch (e) {
    dbHealth = { healthy: false, error: e };
  }

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

// TEMPORARY: Test endpoint to trigger evidence pipeline (for debugging)
// SECURITY FIX: Only available in development mode
if (process.env.NODE_ENV === 'development') {
  app.get('/api/test-evidence-pipeline/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      console.log(`🧪 [Test] Triggering evidence pipeline for user ${userId}`);
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
  // Create HTTP server for WebSocket support
  const server = http.createServer(app);

  // Initialize WebSocket server
  initializeWebSocketServer(server);

  // Initialize Bull queues for background job processing
  initializeQueues();

  // Initialize OAuth rate limiting (Redis or in-memory fallback)
  await initializeRateLimiter();

  // Start background services (development only)
  // In production, these are handled by Vercel Cron Jobs calling /api/cron/* endpoints
  // Set DISABLE_BACKGROUND_JOBS=true to skip background workers (useful when DB is under load)
  const disableBackgroundJobs = process.env.DISABLE_BACKGROUND_JOBS === 'true';
  if (disableBackgroundJobs) {
    console.log('⚠️  Background jobs DISABLED (DISABLE_BACKGROUND_JOBS=true). Skipping cron workers.');
  } else {
    console.log('🔧 Initializing background services (development mode)...');

    // Platform polling service - platform-specific schedules
    // Production equivalent: Vercel Cron → /api/cron/platform-polling
    startPlatformPolling();

    // Token lifecycle background jobs (token refresh + OAuth state cleanup)
    // - Token refresh: Every 5 minutes (prevents token expiration)
    // - OAuth cleanup: Every 15 minutes (removes expired/used states)
    // Production equivalent: Vercel Cron → /api/cron/token-refresh
    startBackgroundJobs();

    // Pattern learning job (feedback processing + insight generation)
    // - Processes user feedback every 6 hours
    // - Generates personalized insights using Claude AI
    // Production equivalent: Vercel Cron → /api/cron/pattern-learning
    startPatternLearningJob();

    // Token expiry notification service
    // - Checks daily for tokens about to expire
    // - Creates user notifications prompting reconnection before data flow interrupts
    startTokenExpiryNotifier();

    // Observation ingestion service
    // - Pulls platform data (Spotify, Calendar, YouTube) every 30 minutes
    // - Converts to natural-language observations in the memory stream
    // - Triggers reflection engine when importance accumulates
    // Production equivalent: Vercel Cron → /api/cron/ingest-observations
    startObservationIngestion();
  }


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
    console.log(`   - Pattern Learning:`);
    console.log(`     • Feedback Processing: Every 6 hours`);
    console.log(`     • Test endpoint: http://localhost:${PORT}/api/test-pattern-learning/status`);
    console.log(`   - Observation Ingestion:`);
    console.log(`     • Spotify/Calendar/YouTube: Every 30 minutes`);
    console.log(`     • Cron endpoint: /api/cron/ingest-observations`);
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





