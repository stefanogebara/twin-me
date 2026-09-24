import express from 'express';
import { resolveRequestTimeout } from './config/requestTimeouts.js';
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
import { initializeWebSocketServer } from './services/websocketService.js';
import { initializeRateLimiter, shutdownRateLimiter } from './middleware/oauthRateLimiter.js';
import { startObservationIngestion, stopObservationIngestion } from './services/observationIngestion.js';

// Google Workspace tools — registers Gmail, Calendar, Drive, Docs, Sheets, Contacts tools
import { registerGoogleWorkspaceTools } from './services/tools/googleWorkspaceTools.js';
// Extended tools — web search, GitHub, Spotify, meeting prep
import { registerExtendedTools } from './services/tools/extendedTools.js';

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

// Soft-required: warn loudly if absent, but don't crash. audit-2026-05-08 LOW-2
// — when ADMIN_EMAILS is empty the admin-beta routes return 403 silently with
// no operator-visible signal. Surface it at boot so misconfiguration is loud.
const SOFT_REQUIRED_ENV_VARS = ['ADMIN_EMAILS'];
const missingSoft = SOFT_REQUIRED_ENV_VARS.filter(key => !process.env[key]);
if (missingSoft.length > 0 && process.env.NODE_ENV === 'production') {
  log.warn('Soft-required env vars not set — feature will silently 403', { missingSoft });
}

const app = express();
const PORT = process.env.PORT || 3001;

// Register Google Workspace tools (Gmail, Calendar, Drive, Docs, Sheets, Contacts)
registerGoogleWorkspaceTools();
// Register extended tools (web search, GitHub, Spotify, meeting prep)
registerExtendedTools();

// Initialize Sentry for error tracking (only if SENTRY_DSN is configured)
if (process.env.SENTRY_DSN) {
  // @sentry/node v10: the Handlers/Integrations namespaces were removed in v8.
  // init() here; the Express error handler is wired after routes below via
  // Sentry.setupExpressErrorHandler. (The old v7 API threw at module load the
  // instant a DSN was set, taking down every /api/* request.)
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in dev
  });

  log.info('Sentry error tracking initialized');
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
const productionOrigins = [
  process.env.VITE_APP_URL,
  'https://twin-ai-learn.vercel.app',
  'https://twinme.me',
  'https://www.twinme.me',
  // TwinMe Desktop (Tauri webview): the bundled onboarding page calls the public
  // observe-summary endpoint cross-origin. These origins are only ever our own
  // desktop app's webview (macOS/Linux: tauri://localhost; Windows: http(s)://tauri.localhost).
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
].filter(Boolean);

const devOrigins = [
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:8083',
  'http://localhost:8084',
  'http://localhost:8085',
  'http://localhost:8086',
  'http://127.0.0.1:8086',
];

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? productionOrigins
  : [...productionOrigins, ...devOrigins];

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

    // Allow specific known browser extensions only (wildcard removed — too broad)
    // Add specific extension IDs here if a first-party extension is ever built
    // e.g. if (origin === 'chrome-extension://abcdef1234567890abcdef1234567890ab') ...


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
  max: isDevelopment ? 1000 : (parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 500), // 1000 in dev, 500 in prod
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 15 * 60 * 1000
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // OAuth initiation redirects to Google — must never return 429 (user would see raw JSON, not a UI error)
    if (req.path.startsWith('/auth/oauth/')) return true;
    // Onboarding has its own dedicated limiter (18-question interview needs ~40 requests)
    if (req.path.startsWith('/onboarding/')) return true;
    return false;
  }
});

// Dedicated rate limit for /auth/verify (runs on every page load — generous but not unlimited)
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,             // 60 req/min (normal use is < 5/min)
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many verify requests' },
});

// Stricter rate limiting for authentication endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/* The retired twin's routes answer 410 here, before any router sees them, while the twin is
   parked (LEGACY_TWIN_ENABLED=false). The list and the switch live in middleware/legacyTwin.js;
   the goal test holds the list complete against every mount below (2026-09-22, M1-A). */
app.use('/api', legacyTwinRouteGate);

// Apply auth rate limiter before general API limiter
app.use('/api/auth/verify', verifyLimiter);
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
app.use('/api/life-story/session/turn', aiLimiter); // Story Chapters turn endpoint — one LLM call per hit
app.use('/api/task-brief', aiLimiter); // Task-brief compiler — retrieval + one LLM extraction per hit
// Two-phase fidelity submission: /answers is now LLM-free (store the
// user's wave immediately), so the AI limiter belongs on the phase-2
// twin-answering path instead.
app.use('/api/twin-fidelity/wave', aiLimiter); // Fidelity phase 2 — twin battery answering (LLM)
app.post('/api/desktop/observe-summary', aiLimiter); // UNAUTHENTICATED LLM endpoint — cap OpenRouter cost-amplification
app.use('/api/extension/batch', aiLimiter);   // batch ingest fans out embedding + importance LLM calls — cap cost (audit)
app.use('/api/extension/analyze', aiLimiter); // LLM/integration analysis endpoint — cap cost (audit)

// Global request timeout to prevent hanging on DB outages.
// The table lives in api/config/requestTimeouts.js so it is testable: a route
// missing from it inherits 30s and dies mid-flight with a 504 that reads like
// a downstream outage. That is how /api/inngest killed every Inngest step at
// 30,007ms on 2026-08-26 (a step runs its whole body in ONE request).
// Values are clamped to just under Vercel's 60s maxDuration so the graceful
// 504 can actually return (audit 2026-07-02 M-5).
app.use((req, res, next) => {
  const capped = resolveRequestTimeout(req.path, {
    method: req.method,
    useCurlFetch: process.env.USE_CURL_FETCH === 'true',
  });
  req.setTimeout(capped);
  res.setTimeout(capped, () => {
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
import { legacyTwinGate, legacyTwinRouteGate } from './middleware/legacyTwin.js';
app.use(requestLogger());

// Billing webhook needs raw body — mount BEFORE express.json
app.use('/api/billing', billingRoutes);

// Parse text/plain bodies for WhatsApp import (must be before express.json so the stream isn't consumed)
app.use('/api/whatsapp/import', express.text({ limit: '10mb', type: 'text/plain' }));

// Extension batch route needs a much higher JSON limit. The default 100kb below
// rejects ~every batch because Instagram collector dumps savedPosts + userPosts
// + interests + following in one shot, and soul-observer batches many tab
// visits. We saw continuous 413/500 cycles in prod after v3.9.1 ship until
// this mount went in. Mounted BEFORE the global express.json so the more
// specific 5mb limit wins for /api/extension/*.
// audit-2026-05-28: extension v3.9.1 in prod hit 413 + 500 on every batch.
app.use('/api/extension', express.json({ limit: '5mb' }));
// The elder channel posts a whole call's transcript (up to 400 turns x 4,000 chars,
// 1.6 MB); under the 100 kB default a 40-minute call was refused with 413 and lost.
app.use('/api/presence-call', express.json({ limit: '2mb' }));

// Parse JSON bodies — capture raw body for webhook signature verification
app.use(express.json({
  limit: '100kb',
  verify: (req, _res, buf) => {
    // Store raw body for HMAC verification on webhook routes — otherwise the
    // signature check is fed JSON.stringify(req.body), which is NOT
    // byte-equivalent to the provider's original payload and the HMAC always
    // mismatches, so every signed POST returns 403.
    if (req.originalUrl.startsWith('/api/whatsapp/webhook') ||
        req.originalUrl.startsWith('/api/telegram/webhook') ||
        req.originalUrl.startsWith('/api/money/inbox/resend') ||
        req.originalUrl.startsWith('/api/nango-webhooks') ||
        req.originalUrl.startsWith('/api/webhooks/elevenlabs')) {
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
import authRoutes from './routes/auth-simple.js';
import oauthCallbackRoutes from './routes/oauth-callback.js';
import webhookRoutes from './routes/webhooks.js';
// audit-2026-05-08 code-quality HIGH: debug-platform-fetch + 3 test-* routes
// were imported at top-level even though they're only mounted in dev. The
// modules were parsed on every prod cold start. Defer to dynamic import at
// the mount site so they no longer drag into the production bundle.
import calendarOAuthRoutes from './routes/calendar-oauth.js';
import desktopDownloadRoutes from './routes/desktop-download.js';
// Bank aggregators (Pluggy/Plaid/TrueLayer) removed in replan-2026-06-12: no
// budget for prod aggregator fees and sandbox data is fake. Money feature now
// feeds from CSV/OFX upload, WhatsApp capture, and notification-listener
// purchases. DB keeps inert provider columns; git history has the code.
import extensionDataRoutes from './routes/extension-data.js';
import accountRoutes from './routes/account.js';
import consentRoutes from './routes/consent.js';
import cronMoneyPullRoutes from './routes/cron-money-pull.js';
import cronMoneyLearnRoutes from './routes/cron-money-learn.js';
import cronPresenceCallsRoutes from './routes/cron-presence-calls.js';
import webhooksElevenlabsRoutes from './routes/webhooks-elevenlabs.js';
import whatsappImportRoutes from './routes/whatsapp-import.js';
import featureFlagsRoutes from './routes/feature-flags.js';
import billingRoutes from './routes/billing.js';
import emailUnsubscribeRoutes from './routes/email-unsubscribe.js';
import systemHealthRoutes from './routes/system-health.js';
import healthRoutes from './routes/health.js';
import betaPublicRoutes from './routes/beta-public.js';
import betaSignupRoutes from './routes/beta.js';
import { betaAdminRouter } from './routes/beta-admin.js';
import betaFeedbackRouter from './routes/beta-feedback.js';
// Phase 1 Agentic Foundation routes
import cronStatementNagRoutes from './routes/cron-statement-nag.js';
import cronAgentActionsCleanupRoutes from './routes/cron-agent-actions-cleanup.js';
import cronNangoOrphanCleanupRoutes from './routes/cron-nango-orphan-cleanup.js';
import cronStripeWebhookEventsCleanupRoutes from './routes/cron-stripe-webhook-events-cleanup.js';
import cronLlmUsageLogCleanupRoutes from './routes/cron-llm-usage-log-cleanup.js';
import cronHealthMonitorRoutes from './routes/cron-health-monitor.js';
import moneyRoutes, { bankCallback } from './routes/money.js';
import purchaseNotificationRoutes from './routes/purchase-notification.js';
import whatsappKapsoWebhookRoutes from './routes/whatsapp-kapso-webhook.js';
import whatsappLinkRoutes from './routes/whatsapp-link.js';
import inngestRoutes from './routes/inngest.js';
import presenceRoutes from './routes/presence.js';
import presenceCallRoutes from './routes/presence-call.js';
// personality-axes + in-silico routes merged into twin-scaling.js

import { sanitizeInput, validateContentType } from './middleware/sanitization.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authenticateUser } from './middleware/auth.js';

// API routes
app.use('/api/system/health', systemHealthRoutes); // System health check (uptime monitors)
// /api/platforms/summary alias — same router. Canonical platform count
// endpoint consumed by /dashboard, /identity, /connect, /wiki, settings
// sidebar, chat header (audit 2026-05-12 H1).
// Both entertainment routers intentionally share the /api/entertainment path;
// Express merges their handlers under the same mount point.
app.use('/api/auth', authRoutes);
app.use('/oauth', oauthCallbackRoutes); // Unified OAuth callback handler

// User preferences (notification settings)
// audit-2026-05-09 S-H3: never return raw Supabase err.message to clients —
// it exposes table/column/constraint/RLS-policy names. Generic message in prod;
// detail only when NODE_ENV !== 'production' for dev debugging.
const _prefsErrPayload = (err, fallback) => ({
  success: false,
  error: process.env.NODE_ENV === 'production' ? fallback : (err?.message || fallback),
});
app.get('/api/users/preferences', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'No user ID' });
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('email_digest_unsubscribed')
      .eq('id', userId)
      .single();
    if (error) {
      log.warn('preferences GET db error', { userId, error: error.message });
      return res.status(500).json(_prefsErrPayload(error, 'Failed to fetch preferences'));
    }
    res.json({ success: true, preferences: { email_digest_unsubscribed: data?.email_digest_unsubscribed || false } });
  } catch (err) {
    log.warn('preferences GET threw', { userId: req.user?.id, error: err?.message });
    res.status(500).json(_prefsErrPayload(err, 'Failed to fetch preferences'));
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
    if (error) {
      log.warn('preferences PATCH db error', { userId, error: error.message });
      return res.status(500).json(_prefsErrPayload(error, 'Failed to update preferences'));
    }
    res.json({ success: true });
  } catch (err) {
    log.warn('preferences PATCH threw', { userId: req.user?.id, error: err?.message });
    res.status(500).json(_prefsErrPayload(err, 'Failed to update preferences'));
  }
});
app.use('/api/webhooks', webhookRoutes); // Real-time webhook receivers (GitHub, Gmail)
app.use('/api/oauth/calendar', calendarOAuthRoutes); // Google Calendar OAuth connect endpoint
app.use('/api/calendar', calendarOAuthRoutes); // Calendar events and sync endpoints
app.use('/api/account', accountRoutes); // Account deletion + data export
app.use('/api/consent', consentRoutes); // User consent management (GDPR/privacy)
app.use('/api/presence', presenceRoutes); // Presence family relay (plan 2026-09-15-presence-forward)
app.use('/api/presence-call', presenceCallRoutes); // Presence elder channel: public, token-authed
app.use('/api/money', bankCallback); // the bank's redirect arrives without a session
app.use('/api/money', moneyRoutes); // Money Twin v2, from zero: sightings → ledger, recurring, forecast (spec 2026-09-07)
app.use('/api/desktop-download', desktopDownloadRoutes); // Same-origin installer proxy (forces correct .exe/.dmg filename)
app.use('/api/cron/money-pull', cronMoneyPullRoutes); // Three bank reads a day, leaving one of the four for the person
app.use('/api/cron/money-learn', cronMoneyLearnRoutes); // Once a day: the day written down and scored, for everyone with a ledger
app.use('/api/cron/presence-calls', cronPresenceCallsRoutes); // Hourly: dial the Presence elders whose local hour it is
app.use('/api/webhooks/elevenlabs', webhooksElevenlabsRoutes); // Presence: post-call transcript (signed) and inbound-call initiation
if (process.env.NODE_ENV === 'development') {
}
app.use('/api/feature-flags', featureFlagsRoutes); // User-facing personality engine flags (all envs)
app.use('/api/extension', extensionDataRoutes); // Browser extension data capture (YouTube, Twitch, Netflix)
app.use('/api/whatsapp', whatsappKapsoWebhookRoutes); // WhatsApp Kapso inbound webhook
app.use('/api/whatsapp', whatsappImportRoutes); // WhatsApp export file parser
// Admin routes return 404 for unauthenticated to prevent route enumeration
app.use('/api/beta', betaPublicRoutes); // Beta invite validation + waitlist (public, no auth)
app.use('/api/beta', betaSignupRoutes); // Beta signup + status + activate (public signup, auth for status)
app.use('/api/beta', betaFeedbackRouter); // Beta feedback submission (auth required, not admin)
app.use('/api/beta/admin', betaAdminRouter); // Beta admin: invite CRUD, waitlist, feedback list

// Phase 1 Agentic Foundation
app.use('/api/cron/statement-nag', cronStatementNagRoutes); // Monthly (1st, 12 UTC) WhatsApp ask for last month's bank statement
app.use('/api/cron/agent-actions-cleanup', cronAgentActionsCleanupRoutes); // Daily 2am UTC: soft-expire pending proposals older than 7 days
app.use('/api/cron/nango-orphan-cleanup', cronNangoOrphanCleanupRoutes); // Weekly Sun 5am UTC: free Nango slots held by retired-platform connections
app.use('/api/cron/stripe-webhook-events-cleanup', cronStripeWebhookEventsCleanupRoutes); // Weekly Sun 4am UTC: prune stripe_webhook_events rows older than 30 days
app.use('/api/cron/llm-usage-log-cleanup', cronLlmUsageLogCleanupRoutes); // Weekly Sun 5:30am UTC: prune llm_usage_log rows older than 90 days
app.use('/api/cron/health-monitor', cronHealthMonitorRoutes); // Daily 04:30 UTC: scan cron_executions for the "looks healthy, does no work" pattern that hid meeting-debrief + pluggy-sync + soul-signature-regen for weeks during the 2026-05-22 audit
app.use('/api/purchase-notification', purchaseNotificationRoutes); // Mobile purchase detection
app.use('/api/whatsapp-link', whatsappLinkRoutes); // WhatsApp self-serve phone linking
app.use('/api/inngest', inngestRoutes); // Inngest durable execution endpoint
app.use('/api/email', emailUnsubscribeRoutes); // One-click unsubscribe for digest emails

// Vercel Cron Job endpoints (production automation)
// These are called by Vercel Cron Jobs on schedule (configured in vercel.json)
// Token refresh is on-demand only (no cron) — see tokenRefreshService.js

// /api/finetuning routes removed — DPO/fine-tuning training stack deleted (replan-2026-06-10 cycle 4)
app.use('/api/health', healthRoutes); // Health check (non-blocking with timeout)

// Sentry error handler (after routes, before our own error handlers).
// v10 replacement for the removed Sentry.Handlers.errorHandler().
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app, {
    shouldHandleError(error) {
      // Capture all errors with status code >= 500 (or no status)
      return (error?.status || error?.statusCode || 500) >= 500;
    },
  });
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

    // Observation ingestion service
    // - Pulls platform data (Spotify, Calendar, YouTube) every 30 minutes
    // - Converts to natural-language observations in the memory stream
    // - Triggers reflection engine when importance accumulates
    // Production equivalent: Vercel Cron → /api/cron/ingest-observations
    startObservationIngestion();
  }

  // Start HTTP server
  server.listen(PORT, async () => {
    const hasRedis = !!(process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL);
    log.info('Server started', {
      port: PORT,
      env: process.env.NODE_ENV || 'development',
      cors: process.env.VITE_APP_URL || 'http://localhost:8080',
      bullQueue: hasRedis ? 'Enabled' : 'Fallback',
    });
    // Prewarm Supabase connection pool to avoid 10-17s cold-start on first user request
    try {
      const { supabaseAdmin } = await import('./services/database.js');
      await supabaseAdmin.from('users').select('id').limit(1);
      log.info('Supabase connection prewarmed');
    } catch (e) {
      log.warn('Supabase prewarm failed (non-fatal)', { error: e.message });
    }
  });

  // Graceful shutdown handlers
  const gracefulShutdown = async (signal) => {
    log.info('Graceful shutdown initiated', { signal });

    // Stop background jobs first
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

  // Handle unhandled promise rejections to prevent server crashes.
  //
  // audit-2026-05-16 walkthrough finding: persistence was intermittently
  // failing (~33% loss rate) because Vercel warm function instances were
  // being poisoned by an unhandled rejection somewhere in the codebase.
  // The previous logger here only captured `reason` as-is, which loggers
  // often serialize to just the message string — losing the stack trace
  // that tells us WHERE the rejection originated. Without the stack, we
  // were guessing at which fire-and-forget pattern was the culprit.
  //
  // Now we explicitly extract message + stack + code + name from the
  // Error, plus stringify any non-Error reason. With this, the next
  // poisoned instance will leave a breadcrumb pointing directly at the
  // offending code.
  process.on('unhandledRejection', (reason, promise) => {
    const detail = reason instanceof Error
      ? {
          message: reason.message,
          stack: reason.stack,
          name: reason.name,
          code: reason.code,
        }
      : { reason: String(reason) };
    log.error('Unhandled Promise Rejection', detail);
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

