import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import https from 'https';
import * as Sentry from '@sentry/node';
import { supabaseAdmin } from './services/database.js';

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
import { startObservationIngestion, stopObservationIngestion } from './services/observationIngestion.js';

// Google Workspace tools — registers Gmail, Calendar, Drive, Docs, Sheets, Contacts tools
import { registerGoogleWorkspaceTools } from './services/tools/googleWorkspaceTools.js';

// Structured logging (imported early so log is available throughout server setup)
import { createLogger } from './services/logger.js';
const log = createLogger('Server');

// Only use dotenv in development - Vercel provides env vars directly
// Updated: Fixed SUPABASE_SERVICE_ROLE_KEY truncation issue
// Hot reload trigger: 2026-02-03T00:02 - Cron Claude Sync routes added
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

// Validate required environment variables at startup
const REQUIRED_ENV_VARS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'OPENROUTER_API_KEY',
];

const missingVars = REQUIRED_ENV_VARS.filter(key => !process.env[key]);
if (missingVars.length > 0) {
  log.error('FATAL: Missing required environment variables', { missingVars });
  log.error('Server cannot start without these. Check .env or hosting config.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Register Google Workspace tools (Gmail, Calendar, Drive, Docs, Sheets, Contacts)
registerGoogleWorkspaceTools();

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

  log.info('Sentry error tracking initialized');

  // RequestHandler must be the first middleware
  app.use(Sentry.Handlers.requestHandler());

  // TracingHandler creates a trace for every incoming request
  app.use(Sentry.Handlers.tracingHandler());
} else if (process.env.NODE_ENV === 'production') {
  // Only warn in production - in development, Sentry is typically not needed
  log.warn('Sentry DSN not configured - error tracking disabled');
}

// Trust proxy - required for Vercel serverless functions
// This allows Express to correctly identify client IPs from X-Forwarded-For headers
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Tailwind/inline styles need unsafe-inline
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
      connectSrc: [
        "'self'",
        "https://*.supabase.co",
        "https://openrouter.ai",
        "https://us.posthog.com",
        "https://fonts.googleapis.com",
      ].filter(Boolean),
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  // Prevent clickjacking
  frameguard: { action: 'deny' },
  // Don't expose server info
  hidePoweredBy: true,
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
  'https://twin-ai-learn.vercel.app',
  'https://twinme.me',
  'https://www.twinme.me',
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // No-origin requests: server-to-server (crons, webhooks, health checks) don't send Origin.
    // In development, allow all no-origin requests (curl, Postman, mobile).
    // In production, return false to omit CORS headers — non-browser clients are unaffected
    // (CORS is browser-enforced), and JWT is the real security guard.
    if (!origin) {
      if (process.env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      return callback(null, false);
    }

    // Allow browser extensions — auth middleware handles security via JWT
    if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
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
    log.warn('CORS rejected origin', { origin });
    // Return false (no CORS headers) instead of Error to avoid leaking stack traces
    return callback(null, false);
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
  max: isDevelopment ? 1000 : (parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200), // 1000 in dev, 200 in prod
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 15 * 60 * 1000
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for auth verification in development
    if (isDevelopment && req.path === '/auth/verify') return true;
    // Onboarding has its own dedicated limiter (18-question interview needs ~40 requests)
    if (req.path.startsWith('/onboarding/')) return true;
    return false;
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

// Generous rate limit for onboarding interview (18 questions = ~40 requests)
const onboardingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  message: { error: 'Onboarding rate limit reached. Please wait a moment and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/onboarding/', onboardingLimiter);

// Apply rate limiting to all API routes (except skipped ones)
app.use('/api/', apiLimiter);

// Stricter rate limiting for AI endpoints
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 1000 : 50, // avoid throttling local dev/test runs
  message: {
    error: 'AI request limit exceeded. Please try again later.',
    retryAfter: 15 * 60 * 1000
  },
});

app.use('/api/ai/', aiLimiter);
// Only rate-limit the actual LLM endpoints, not cheap DB reads like /chat/usage,
// /chat/history, /chat/conversations, /chat/context. The old broad /api/chat/ rule
// burned the 50-req budget on page-load prefetches before users could send messages.
app.post('/api/chat/message', aiLimiter);
app.get('/api/chat/intro', aiLimiter);    // Generates a personalised first message (LLM)
app.use('/api/soul-extraction/', aiLimiter); // LLM-powered extraction endpoints

// Global request timeout to prevent hanging on DB outages
// Longer timeout in dev when Cloudflare workaround adds latency per query
const DEFAULT_TIMEOUT = process.env.USE_CURL_FETCH === 'true' ? 120000 : 30000;
app.use((req, res, next) => {
  // Chat and cron endpoints need extra time; default 30s for all others
  const timeout = req.path.includes('/chat/message') ? 300000
    : req.path.includes('/cron/') ? 115000
    : req.path.includes('/soul-signature/layers') ? 90000
    : req.path.includes('/onboarding/calibration') ? 90000
    : req.path.includes('/whatsapp-twin/webhook') ? 90000
    : req.path.includes('/telegram-webhook') ? 90000
    : req.path.includes('/discovery/scan') ? 55000
    : req.path.includes('/departments/heartbeat') ? 55000  // LLM heartbeat needs time
    : req.path.includes('/templates/') && req.method === 'POST' ? 45000  // Template apply does multiple DB writes
    : DEFAULT_TIMEOUT;
  req.setTimeout(timeout);
  res.setTimeout(timeout, () => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'Request timeout - database may be unavailable' });
    }
  });
  next();
});

// Circuit breaker — fast-fail when DB is down instead of waiting 30-40s per request
import { circuitBreakerMiddleware, recordFailure, recordSuccess } from './middleware/circuitBreaker.js';
app.use(circuitBreakerMiddleware);

// Sanitize error responses — strip leaked HTML (Cloudflare 522 pages, Supabase errors)
// Also feeds the circuit breaker: detects DB failures from response content
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body && res.statusCode >= 400) {
      const sanitize = (val) => {
        if (typeof val !== 'string') return val;
        if (val.includes('<!DOCTYPE') || val.includes('<html') || val.includes('<head>')) {
          recordFailure(); // DB is down — feed circuit breaker
          return 'Service temporarily unavailable';
        }
        return val.length > 500 ? val.slice(0, 500) + '...' : val;
      };
      if (body.error) body = { ...body, error: sanitize(body.error) };
      if (body.message) body = { ...body, message: sanitize(body.message) };
    } else if (body && res.statusCode < 400) {
      recordSuccess(); // DB responded OK — reset circuit breaker
    }
    return originalJson(body);
  };
  next();
});

// Structured request logging (before routes, after rate limiting)
import { requestLogger } from './services/logger.js';
app.use(requestLogger());

// Billing webhook needs raw body — mount BEFORE express.json
app.use('/api/billing', billingRoutes);

// Parse text/plain bodies for WhatsApp import (must be before express.json so the stream isn't consumed)
app.use('/api/whatsapp/import', express.text({ limit: '10mb', type: 'text/plain' }));

// Parse JSON bodies — capture raw body for webhook signature verification
app.use(express.json({
  limit: '100kb',
  verify: (req, _res, buf) => {
    // Store raw body for HMAC verification on webhook routes
    if (req.originalUrl.startsWith('/api/whatsapp/webhook') ||
        req.originalUrl.startsWith('/api/telegram/webhook')) {
      req.rawBody = buf.toString('utf8');
    }
  },
}));

// Parse cookies (httpOnly refresh token cookie)
app.use(cookieParser());

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
import dashboardContextRoutes from './routes/dashboard-context.js';
import dataSourcesRoutes from './routes/data-sources.js';
import webhookRoutes from './routes/webhooks.js';
import sseRoutes from './routes/sse.js';
import queueDashboardRoutes from './routes/queue-dashboard.js';
import cronPlatformPollingHandler from './routes/cron-platform-polling.js';
import cronPatternLearningHandler from './routes/cron-pattern-learning.js';
import cronObservationIngestionHandler from './routes/cron-observation-ingestion.js';
import debugPlatformFetchHandler from './routes/debug-platform-fetch.js';
import soulSignatureRoutes from './routes/soul-signature.js';
import soulInsightsRoutes from './routes/soul-insights.js';
import testExtractionRoutes from './routes/test-extraction.js';
import calendarOAuthRoutes from './routes/calendar-oauth.js';
import spotifyOAuthRoutes from './routes/spotify-oauth.js';
import intelligentTwinRoutes from './routes/intelligent-twin.js';
import testPatternLearningRoutes from './routes/test-pattern-learning.js';
import onboardingQuestionsRoutes from './routes/onboarding-questions.js';
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
import adminBetaRoutes from './routes/admin-beta.js';
import onboardingCalibrationRoutes from './routes/onboarding-calibration.js';
import onboardingVoiceRoutes from './routes/onboarding-voice.js';
import onboardingSoulSignatureRoutes from './routes/onboarding-soul-signature.js';
import onboardingPlatformPreviewRoutes from './routes/onboarding-platform-preview.js';
import accountRoutes from './routes/account.js';
import apiKeysRoutes from './routes/api-keys.js';
import consentRoutes from './routes/consent.js';
import privacySettingsRoutes from './routes/privacy-settings.js';
import soulSignaturePublicRoutes from './routes/soul-signature-public.js';
import portfolioPublicRoutes from './routes/portfolio-public.js';
import goalsRoutes from './routes/goals.js';
import checkinRoutes from './routes/checkin.js';
import importsRoutes from './routes/imports.js';
import cronMemoryArchiveRoutes from './routes/cron-memory-archive.js';
import cronMemoryForgettingRoutes from './routes/cron-memory-forgetting.js';
import cronMemorySaliencyReplayRoutes from './routes/cron-memory-saliency-replay.js';
import memoryHealthRoutes from './routes/memory-health.js';
import memoriesRoutes from './routes/memories.js';
import memoryLinksRoutes from './routes/memory-links.js';
import githubConnectRoutes from './routes/github-connect.js';
import whatsappImportRoutes from './routes/whatsapp-import.js';
import evalRoutes from './routes/eval.js';
import featureFlagsRoutes from './routes/feature-flags.js';
import twinIdentityRoutes from './routes/twin-identity.js';
import locationRoutes from './routes/location.js';
import billingRoutes from './routes/billing.js';
import discoveryRoutes from './routes/discovery.js';
import cronEmailDigestHandler from './routes/cron-email-digest.js';
import emailUnsubscribeRoutes from './routes/email-unsubscribe.js';
import personalityProfileRoutes from './routes/personality-profile.js';
import systemHealthRoutes from './routes/system-health.js';
import healthRoutes from './routes/health.js';
import testEvidencePipelineRoutes from './routes/test-evidence-pipeline.js';
import finetuningRoutes from './routes/finetuning.js';
import betaPublicRoutes from './routes/beta-public.js';
import betaSignupRoutes from './routes/beta.js';
import { betaFeedbackRouter, betaAdminRouter } from './routes/beta-admin.js';
// OG image routes loaded lazily to prevent font-loading crashes from taking down the whole server
let ogImageRoutes = null;
try {
  ogImageRoutes = (await import('./routes/og-image.js')).default;
} catch (err) {
  log.warn('Failed to load OG image routes', { error: err });
}
// Phase 1 Agentic Foundation routes
import autonomyRoutes from './routes/autonomy.js';
import agentActionsRoutes from './routes/agent-actions.js';
import departmentsRoutes from './routes/departments.js';
import templatesRoutes from './routes/templates.js';
import cronProspectiveCheckRoutes from './routes/cron-prospective-check.js';
import cronEveningRecapRoutes from './routes/cron-evening-recap.js';
import cronDeliverInsightsRoutes from './routes/cron-deliver-insights.js';
import cronIntelligentTriggersRoutes from './routes/cron-intelligent-triggers.js';
import cronMorningBriefingRoutes from './routes/cron-morning-briefing.js';
import cronMorningBriefingEmailRoutes from './routes/cron-morning-briefing-email.js';
import cronActionReflectionRoutes from './routes/cron-action-reflection.js';
import cronCalendarOptimizationRoutes from './routes/cron-calendar-optimization.js';
import cronNudgeInactiveRoutes from './routes/cron-nudge-inactive.js';
import cronDepartmentExecuteRoutes from './routes/cron-department-execute.js';
import wikiRoutes from './routes/wiki.js';
import insightFeedbackRoutes from './routes/insight-feedback.js';
import userRulesRoutes from './routes/user-rules.js';
import whatsappTwinWebhookRoutes from './routes/whatsapp-twinme-webhook.js';
import whatsappKapsoWebhookRoutes from './routes/whatsapp-kapso-webhook.js';
import webPushRoutes from './routes/web-push.js';
import telegramWebhookRoutes from './routes/telegram-webhook.js';
import telegramLinkRoutes from './routes/telegram-link.js';
import whatsappLinkRoutes from './routes/whatsapp-link.js';
import inngestRoutes from './routes/inngest.js';
import skillsRoutes from './routes/skills.js';
import twinScalingRoutes from './routes/twin-scaling.js';
import multimodalRoutes from './routes/multimodal.js';
import morningBriefingRoutes from './routes/morning-briefing.js';
import sidebarContextRoutes from './routes/sidebar-context.js';
import soulInterviewRoutes from './routes/soul-interview.js';
import inboxSummaryRoutes from './routes/inbox-summary.js';
// personality-axes + in-silico routes merged into twin-scaling.js

import { sanitizeInput, validateContentType } from './middleware/sanitization.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authenticateUser } from './middleware/auth.js';

// API routes
app.use('/api/system/health', systemHealthRoutes); // System health check (uptime monitors)
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

// User preferences (notification settings)
app.get('/api/users/preferences', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'No user ID' });
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('email_digest_unsubscribed')
      .eq('id', userId)
      .single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, preferences: { email_digest_unsubscribed: data?.email_digest_unsubscribed || false } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch preferences' });
  }
});
app.patch('/api/users/preferences', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'No user ID' });
    const { email_digest_unsubscribed } = req.body;
    if (typeof email_digest_unsubscribed !== 'boolean') {
      return res.status(400).json({ success: false, error: 'email_digest_unsubscribed must be boolean' });
    }
    const { error } = await supabaseAdmin
      .from('users')
      .update({ email_digest_unsubscribed })
      .eq('id', userId);
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to update preferences' });
  }
});
app.use('/api/dashboard/context', dashboardContextRoutes);
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
app.use('/api/onboarding/voice', onboardingVoiceRoutes);  // Voice interview — ElevenLabs custom LLM wrapper
app.use('/api/onboarding', onboardingSoulSignatureRoutes); // Instant soul signature from enrichment + calibration
app.use('/api/onboarding', onboardingPlatformPreviewRoutes); // Platform preview insights during onboarding
app.use('/api/interview', soulInterviewRoutes); // Soul Interview — cold start personality builder
app.use('/api/account', accountRoutes); // Account deletion + data export
app.use('/api/api-keys', apiKeysRoutes); // Claude Desktop MCP API key management
app.use('/api/consent', consentRoutes); // User consent management (GDPR/privacy)
app.use('/api/privacy-settings', privacySettingsRoutes); // Privacy spectrum dashboard
app.use('/api/soul-signature', soulSignaturePublicRoutes); // Public share + visibility toggle
app.use('/api/portfolio', portfolioPublicRoutes); // Public portfolio page aggregated endpoint
if (ogImageRoutes) app.use('/api', ogImageRoutes); // OG image cards (/api/og/soul-card, /api/s/:userId)
app.use('/api/big-five', bigFiveRoutes); // IPIP-NEO-120 Big Five assessment with T-score normalization
app.use('/api/costs', (await import('./routes/cost-dashboard.js')).default); // AI cost dashboard
app.use('/api/insights', platformInsightsRoutes); // Platform-specific conversational insights
app.use('/api/goals', goalsRoutes); // Twin-driven goal tracking (suggestions, progress, accountability)
app.use('/api/wiki', wikiRoutes); // LLM Wiki compiled knowledge pages (Karpathy pattern)
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
app.use('/api/cron/memory-saliency-replay', cronMemorySaliencyReplayRoutes); // Daily saliency replay (CL1-inspired)
app.use('/api/memories', memoriesRoutes); // Memory stream browser with filters
app.use('/api/memory-health', memoryHealthRoutes); // Memory stream health dashboard
app.use('/api/memory/:memoryId', memoryLinksRoutes); // A-MEM Zettelkasten memory links
if (process.env.NODE_ENV === 'development') {
  app.use('/api/eval', evalRoutes); // Twin eval rubric + feature flags (dev-only)
  app.use('/api/feature-flags', featureFlagsRoutes); // User-facing personality engine flags
}
app.use('/api/personality-profile', personalityProfileRoutes); // Soul Signature voting layer — OCEAN, stylometrics, sampling params
app.use('/api/twin', twinIdentityRoutes); // Who You Are identity explorer
app.use('/api/twins-brain', twinsBrainRoutes); // Twins Brain unified knowledge graph
app.use('/api/mem0', mem0Routes); // Mem0 intelligent memory layer
app.use('/api/mem0-sync', mem0BrainSyncRoutes); // Mem0 → Twins Brain sync
app.use('/api/correlations', correlationsRoutes); // Cross-platform correlation detection (X Phoenix-inspired)
app.use('/api/nango', nangoRoutes); // Nango unified API for 10 platform connections
app.use('/api/nango-webhooks', nangoWebhooksRoutes); // Nango webhook receiver
app.use('/api/extension', extensionDataRoutes); // Browser extension data capture (YouTube, Twitch, Netflix)
app.use('/api/github', githubConnectRoutes);   // GitHub PAT connection + status
app.use('/api/whatsapp', whatsappKapsoWebhookRoutes); // WhatsApp Kapso inbound webhook
app.use('/api/whatsapp', whatsappImportRoutes); // WhatsApp export file parser
app.use('/api/journal', journalRoutes); // Soul Journal - personal journaling with AI analysis
// Admin routes return 404 for unauthenticated to prevent route enumeration
app.use('/api/admin', (req, res, next) => {
  if (!req.headers.authorization) return res.status(404).json({ error: 'NOT_FOUND', message: 'Endpoint not found' });
  next();
}, adminLlmCostsRoutes);
app.use('/api/admin/beta', (req, res, next) => {
  if (!req.headers.authorization) return res.status(404).json({ error: 'NOT_FOUND', message: 'Endpoint not found' });
  next();
}, adminBetaRoutes);
app.use('/api/beta', betaPublicRoutes); // Beta invite validation + waitlist (public, no auth)
app.use('/api/beta', betaSignupRoutes); // Beta signup + status + activate (public signup, auth for status)
app.use('/api/beta', betaFeedbackRouter); // Beta feedback submission (auth required, not admin)
app.use('/api/beta/admin', betaAdminRouter); // Beta admin: invite CRUD, waitlist, feedback list
app.use('/api/location', locationRoutes); // Location clusters — privacy-first lifestyle signals
app.use('/api/discovery', discoveryRoutes); // Public pre-signup discovery scan

// Phase 1 Agentic Foundation
app.use('/api/autonomy', autonomyRoutes); // Per-skill autonomy spectrum settings
app.use('/api/agent-actions', agentActionsRoutes); // Agent action logging + outcome tracking
app.use('/api/departments', departmentsRoutes); // SoulOS department management + proposals
app.use('/api/inbox', inboxSummaryRoutes); // Inbox summary for Communications department
app.use('/api/templates', templatesRoutes); // Life Operating System templates (one-click department setups)
app.use('/api/cron/prospective-check', cronProspectiveCheckRoutes); // Prospective memory trigger check (*/5 min)
app.use('/api/cron/evening-recap', cronEveningRecapRoutes); // Daily evening recap (11pm UTC)
app.use('/api/cron/deliver-insights', cronDeliverInsightsRoutes); // Deliver insights to messaging channels (*/5 min)
app.use('/api/cron/intelligent-triggers', cronIntelligentTriggersRoutes); // Daily intelligent triggers (10am UTC)
app.use('/api/cron/morning-briefing', cronMorningBriefingRoutes); // Daily morning briefing (10am UTC / 7am São Paulo)
app.use('/api/cron/morning-briefing-email', cronMorningBriefingEmailRoutes); // Daily morning briefing email (11am UTC / 8am São Paulo)
app.use('/api/cron/action-reflection', cronActionReflectionRoutes); // Daily action reflection (5am UTC)
app.use('/api/cron/calendar-optimization', cronCalendarOptimizationRoutes); // Weekday calendar optimization (8am UTC / 5am São Paulo)
app.use('/api/cron/nudge-inactive', cronNudgeInactiveRoutes); // Daily nudge for users with 0 platforms connected
app.use('/api/cron/department-execute', cronDepartmentExecuteRoutes); // Every 3h: auto-execute autonomous department proposals
app.use('/api/insights', insightFeedbackRoutes); // Insight feedback (thumbs up/down)
app.use('/api/user-rules', userRulesRoutes); // User-curated rules the twin must obey
app.use('/api/whatsapp-twin', whatsappTwinWebhookRoutes); // WhatsApp twin chat (live)
app.use('/api/web-push', webPushRoutes); // Web push notification subscribe/unsubscribe
app.use('/api/telegram/webhook', telegramWebhookRoutes); // Telegram bot webhook
app.use('/api/telegram', telegramLinkRoutes); // Telegram account linking
app.use('/api/whatsapp-link', whatsappLinkRoutes); // WhatsApp self-serve phone linking
app.use('/api/inngest', inngestRoutes); // Inngest durable execution endpoint
app.use('/api/skills', skillsRoutes); // Twin skill definitions + execution
app.use('/api/twin', twinScalingRoutes); // Twin scaling + fidelity canonical endpoints
app.use('/api/tribe', twinScalingRoutes); // TRIBE v2: ICA axes, in-silico, and scaling aliases
// personality-axes + in-silico routes are in twinScalingRoutes
app.use('/api/twin', multimodalRoutes); // Multimodal personality fusion (TRIBE v2 Phase C)
app.use('/api/morning-briefing', morningBriefingRoutes); // On-demand morning briefing (GET /api/morning-briefing/generate)
app.use('/api/sidebar', sidebarContextRoutes); // Sidebar context: calendar events + recent emails
app.use('/api/cron/email-digest', cronEmailDigestHandler); // Weekly email digest (Mondays 9am)
app.use('/api/email', emailUnsubscribeRoutes); // One-click unsubscribe for digest emails

// Vercel Cron Job endpoints (production automation)
// These are called by Vercel Cron Jobs on schedule (configured in vercel.json)
// Token refresh is on-demand only (no cron) — see tokenRefreshService.js
app.use('/api/cron/platform-polling', cronPlatformPollingHandler); // Every 30 minutes
app.use('/api/cron/pattern-learning', cronPatternLearningHandler); // Every 6 hours
app.use('/api/cron/ingest-observations', cronObservationIngestionHandler); // Every 30 minutes
app.use('/api/debug/platform-fetch', debugPlatformFetchHandler); // Diagnostic: direct fetcher call

app.use('/api/finetuning', finetuningRoutes); // Behavioral finetuning (together.ai personality oracle)
app.use('/api/chat', finetuningRoutes); // Chat feedback endpoint (POST /api/chat/feedback) — shared router
app.use('/api/health', healthRoutes); // Health check (non-blocking with timeout)
if (process.env.NODE_ENV === 'development') {
  app.use('/api/test-evidence-pipeline', testEvidencePipelineRoutes); // Evidence pipeline debugging
}

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
// - Development: Background services (platform polling, etc.) run via node-cron
// - Production (Vercel): Vercel Cron Jobs call HTTP endpoints (see vercel.json)
// - Token refresh is on-demand only (no cron) — triggered by status checks and data fetches
// - This is necessary because Vercel serverless functions are stateless - persistent
//   cron jobs won't work. Vercel Cron calls our endpoints on schedule instead.
//
log.debug('NODE_ENV check', { nodeEnv: process.env.NODE_ENV, isNotProduction: process.env.NODE_ENV !== 'production' });

if (process.env.NODE_ENV !== 'production') {
  log.info('Entering development server initialization block');
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
    log.warn('Background jobs DISABLED (DISABLE_BACKGROUND_JOBS=true)');
  } else {
    log.info('Initializing background services (development mode)');

    // Platform polling service - platform-specific schedules
    // Production equivalent: Vercel Cron → /api/cron/platform-polling
    startPlatformPolling();

    // Token lifecycle background jobs (OAuth state cleanup)
    // - OAuth cleanup: Every 15 minutes (removes expired/used states)
    // - Token refresh: on-demand only (triggered by status checks and data fetches)
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
    const hasRedis = !!(process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL);
    log.info('Server started', {
      port: PORT,
      env: process.env.NODE_ENV || 'development',
      cors: process.env.VITE_APP_URL || 'http://localhost:8080',
      bullQueue: hasRedis ? 'Enabled' : 'Fallback',
    });
  });

  // Graceful shutdown handlers
  const gracefulShutdown = async (signal) => {
    log.info('Graceful shutdown initiated', { signal });

    // Stop background jobs first
    stopBackgroundJobs();
    stopPatternLearningJob();
    stopTokenExpiryNotifier();
    stopObservationIngestion();

    // Shutdown rate limiter
    await shutdownRateLimiter();

    // Close server
    server.close(() => {
      log.info('Server closed successfully');
      process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown fails
    setTimeout(() => {
      log.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, 10000);
  };

  // Handle unhandled promise rejections to prevent server crashes
  process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Promise Rejection', { reason: reason instanceof Error ? reason : String(reason) });
    // Don't exit - just log and continue
  });

  process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception', { error });
    // For uncaught exceptions, we should exit as the app might be in an inconsistent state
    // But give time for logging
    setTimeout(() => process.exit(1), 1000);
  });

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

export default app;

