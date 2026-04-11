import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { encryptToken, encryptState, decryptState } from '../services/encryption.js';
import profileEnrichmentService from '../services/profileEnrichmentService.js';
import * as betaInviteService from '../services/betaInviteService.js';
import { sendWelcomeEmail } from '../services/emailService.js';
import { getRedisClient, isRedisAvailable } from '../services/redisClient.js';
import { createLogger } from '../services/logger.js';
import { authenticateUser } from '../middleware/auth.js';

const log = createLogger('Auth');

// ====================================================================
// Shared: Resolve the canonical app URL for OAuth redirects
// Priority: APP_URL env > twinme.me detection > vercel.app detection > VITE_APP_URL > localhost
// ====================================================================
function resolveAppUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL;

  const host = req?.get('host') || '';
  // Production custom domain
  if (host.includes('twinme.me')) return 'https://twinme.me';
  // Vercel deployment — use canonical production alias (registered in Google OAuth)
  // NOT the deployment-specific URL (twin-ai-learn-abc123-xxx.vercel.app)
  // NOT twinme.me (was causing redirect_uri mismatch when domain was down)
  if (host.includes('vercel.app')) return 'https://twin-ai-learn.vercel.app';

  // Local development fallback
  return process.env.VITE_APP_URL || 'http://localhost:8086';
}

// Rate limiting for auth endpoints — prevents brute force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 attempts per IP per window (signin/signup brute-force protection)
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  handler: (req, res) => {
    log.warn('Auth rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json({ success: false, error: 'Too many authentication attempts. Please try again in 15 minutes.' });
  },
});

// Separate higher limit for token refresh — not brute-force sensitive (requires valid httpOnly cookie)
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 refreshes per IP (normal navigation won't trip this)
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    log.warn('Refresh rate limit exceeded', { ip: req.ip });
    res.status(429).json({ success: false, error: 'Too many token refresh attempts. Please try again later.' });
  },
});

const AUTH_LOCKOUT_THRESHOLD = 10; // failed attempts before lockout
const AUTH_LOCKOUT_TTL = 15 * 60; // 15 minutes in seconds

// In-memory fallback when Redis is unavailable (prevents brute-force bypass)
// Map<email, { count: number, expiresAt: number }>
const memoryLockoutStore = new Map();

function cleanExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of memoryLockoutStore) {
    if (entry.expiresAt < now) memoryLockoutStore.delete(key);
  }
  // Prevent unbounded growth: evict oldest entries if over 10k
  if (memoryLockoutStore.size > 10_000) {
    const entries = [...memoryLockoutStore.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (let i = 0; i < 5_000; i++) memoryLockoutStore.delete(entries[i][0]);
  }
}

/**
 * Increment the failed-login counter for an account. Returns true if account is now locked.
 * Falls back to in-memory store when Redis is unavailable (never returns false silently).
 */
async function trackAuthFailure(email) {
  try {
    const client = getRedisClient();
    if (client && isRedisAvailable()) {
      const key = `authFailures:${email}`;
      const count = await client.incr(key);
      if (count === 1) await client.expire(key, AUTH_LOCKOUT_TTL);
      return count > AUTH_LOCKOUT_THRESHOLD;
    }
  } catch { /* fall through to memory store */ }

  // In-memory fallback
  cleanExpiredEntries();
  const entry = memoryLockoutStore.get(email) || { count: 0, expiresAt: Date.now() + AUTH_LOCKOUT_TTL * 1000 };
  entry.count += 1;
  if (entry.count === 1) entry.expiresAt = Date.now() + AUTH_LOCKOUT_TTL * 1000;
  memoryLockoutStore.set(email, entry);
  return entry.count > AUTH_LOCKOUT_THRESHOLD;
}

/**
 * Returns true if this account has exceeded the failed-login threshold.
 * Falls back to in-memory store when Redis is unavailable.
 */
async function isAccountLocked(email) {
  try {
    const client = getRedisClient();
    if (client && isRedisAvailable()) {
      const count = parseInt(await client.get(`authFailures:${email}`) || '0', 10);
      return count > AUTH_LOCKOUT_THRESHOLD;
    }
  } catch { /* fall through to memory store */ }

  // In-memory fallback
  const entry = memoryLockoutStore.get(email);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) { memoryLockoutStore.delete(email); return false; }
  return entry.count > AUTH_LOCKOUT_THRESHOLD;
}

/**
 * Clear failed-login counter on successful login.
 */
async function clearAuthFailures(email) {
  memoryLockoutStore.delete(email); // always clear in-memory
  try {
    const client = getRedisClient();
    if (client && isRedisAvailable()) await client.del(`authFailures:${email}`);
  } catch { /* non-fatal */ }
}

const router = express.Router();

// Prevent proxy/CDN caching of auth responses containing tokens
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
});

// Auth codes stored in Supabase (not in-memory) so Vercel serverless instances share state

// JWT secret - required environment variable with minimum strength
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters for security');
}

function generateTokenPair(user) {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '30m' }
  );

  const refreshToken = crypto.randomBytes(64).toString('hex');

  return { accessToken, refreshToken };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Set refresh token as an httpOnly cookie.
 * - httpOnly: JS cannot read it (XSS-safe)
 * - secure: only sent over HTTPS in production
 * - sameSite strict: prevents CSRF
 * - path restricted to /api/auth: only sent to auth endpoints
 */
function setRefreshCookie(res, refreshToken) {
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

function shouldExposeRefreshToken(req) {
  const clientHeader = req.get('x-twin-client')?.toLowerCase();
  const bodyClient = typeof req.body?.client === 'string' ? req.body.client.toLowerCase() : null;
  const queryClient = typeof req.query?.client === 'string' ? req.query.client.toLowerCase() : null;

  return clientHeader === 'mobile' || bodyClient === 'mobile' || queryClient === 'mobile';
}

function buildAuthUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
    createdAt: user.created_at || null,
    created_at: user.created_at || null,
    emailVerified: user.email_verified ?? undefined,
    email_verified: user.email_verified ?? undefined,
  };
}

// Sign up
router.post('/signup', authLimiter, async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Basic input validation
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (password.length > 128) {
      return res.status(400).json({ error: 'Password must be 128 characters or fewer' });
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' });
    }
    if (firstName && typeof firstName === 'string' && firstName.length > 100) {
      return res.status(400).json({ error: 'First name too long' });
    }
    if (lastName && typeof lastName === 'string' && lastName.length > 100) {
      return res.status(400).json({ error: 'Last name too long' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Beta gate: check invite code for email signup
    if (betaInviteService.isBetaGateEnabled()) {
      const inviteCode = req.body.inviteCode;
      const preInvite = await betaInviteService.isEmailPreInvited(normalizedEmail);
      const code = inviteCode || preInvite?.code;
      req._betaInviteCode = code; // Cache for redemption after user creation

      if (!code) {
        betaInviteService.addToWaitlist(normalizedEmail, `${(firstName || '')} ${(lastName || '')}`.trim(), 'rejected_signup').catch(() => {});
        return res.status(403).json({ success: false, error: 'Beta invite code required', waitlist: true });
      }

      const validation = await betaInviteService.validateInviteCode(code);
      if (!validation.valid) {
        return res.status(403).json({ success: false, error: validation.error, waitlist: true });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        email: normalizedEmail,
        password_hash: hashedPassword,
        first_name: (firstName || '').trim().slice(0, 100),
        last_name: (lastName || '').trim().slice(0, 100)
      })
      .select()
      .single();

    if (insertError) {
      log.error('Database error', { error: insertError });
      return res.status(500).json({ error: 'Failed to create user' });
    }

    // Redeem invite code after email signup (reuse code from gate check above)
    if (betaInviteService.isBetaGateEnabled()) {
      const code = req.body.inviteCode || req._betaInviteCode;
      if (code) {
        betaInviteService.redeemInviteCode(code, newUser.id).catch(err =>
          log.error('Invite redeem failed (non-blocking)', { error: err })
        );
      }
    }

    // Generate email verification token and store it
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
    await supabaseAdmin
      .from('users')
      .update({
        email_verification_token: verificationToken,
        email_verification_token_expires_at: tokenExpiresAt,
      })
      .eq('id', newUser.id);

    // Send verification email (optional — don't block signup if RESEND_API_KEY is missing)
    try {
      const appUrl = resolveAppUrl(req);
      const verifyUrl = `${appUrl}/api/auth/verify-email?token=${verificationToken}`;
      if (process.env.RESEND_API_KEY) {
        const { sendVerificationEmail } = await import('../services/emailService.js');
        if (typeof sendVerificationEmail === 'function') {
          sendVerificationEmail({ toEmail: normalizedEmail, firstName: (firstName || '').trim(), verifyUrl }).catch(err =>
            log.warn('Verification email send failed (non-blocking)', { error: err })
          );
        }
      } else {
        log.warn('RESEND_API_KEY not set — skipping verification email', { userId: newUser.id, verifyUrl });
      }
    } catch (emailErr) {
      log.warn('Email verification setup failed (non-blocking)', { error: emailErr });
    }

    // Generate token pair
    const { accessToken, refreshToken } = generateTokenPair(newUser);
    const refreshTokenHash = hashToken(refreshToken);

    // Store refresh token hash
    const { error: signupHashErr } = await supabaseAdmin
      .from('users')
      .update({ refresh_token_hash: refreshTokenHash })
      .eq('id', newUser.id);
    if (signupHashErr) {
      log.error('Failed to store refresh token hash on signup', { error: signupHashErr });
    }

    // Trigger background enrichment for email signup users
    // Save to enriched_profiles for display in onboarding, but do NOT seed memories yet.
    // Memory seeding happens only after user confirms via POST /api/enrichment/confirm.
    const fullName = `${(firstName || '').trim()} ${(lastName || '').trim()}`.trim();
    profileEnrichmentService.enrichFromEmail(normalizedEmail, fullName)
      .then(data => {
        if (data) return profileEnrichmentService.saveEnrichment(newUser.id, normalizedEmail, data);
      })
      .catch(err => log.error('Enrichment failed (non-blocking)', { error: err }));

    setRefreshCookie(res, refreshToken);

    res.json({
      success: true,
      token: accessToken,
      refreshToken: shouldExposeRefreshToken(req) ? refreshToken : undefined,
      user: buildAuthUser(newUser),
    });
  } catch (error) {
    log.error('Signup error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sign in
router.post('/signin', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Per-account lockout check (prevents credential stuffing across IPs)
    if (await isAccountLocked(normalizedEmail)) {
      return res.status(429).json({ error: 'Too many failed attempts. Please wait 15 minutes before trying again.' });
    }

    // Get user
    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, first_name, last_name, password_hash, created_at, email_verified')
      .eq('email', normalizedEmail)
      .single();

    if (fetchError || !user) {
      await trackAuthFailure(normalizedEmail);
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Account uses social login only
    if (!user.password_hash) {
      return res.status(400).json({ error: 'This account uses Google sign-in. Please continue with Google.' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      await trackAuthFailure(normalizedEmail);
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Successful login — clear failure counter
    await clearAuthFailures(normalizedEmail);

    // Generate token pair
    const { accessToken, refreshToken } = generateTokenPair(user);
    const refreshTokenHash = hashToken(refreshToken);

    // Store refresh token hash
    const { error: signinHashErr } = await supabaseAdmin
      .from('users')
      .update({ refresh_token_hash: refreshTokenHash })
      .eq('id', user.id);
    if (signinHashErr) {
      log.error('Failed to store refresh token hash on signin', { error: signinHashErr });
    }

    setRefreshCookie(res, refreshToken);

    res.json({
      success: true,
      token: accessToken,
      refreshToken: shouldExposeRefreshToken(req) ? refreshToken : undefined,
      user: buildAuthUser(user),
    });
  } catch (error) {
    log.error('Signin error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token under the same auth policy as the rest of the API
router.get('/verify', authenticateUser, async (req, res) => {
  try {
    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, first_name, last_name, created_at, email_verified')
      .eq('id', req.user.id)
      .single();

    if (fetchError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.json({
      success: true,
      user: buildAuthUser(user),
    });
  } catch (error) {
    log.error('Token verification error', { error });
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Refresh access token
router.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    // Read refresh token from httpOnly cookie first, fall back to body for backward compat
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const tokenHash = hashToken(refreshToken);

    // Find user by refresh token hash
    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, first_name, last_name, created_at, email_verified')
      .eq('refresh_token_hash', tokenHash)
      .single();

    if (fetchError || !user) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Generate new token pair (rotate refresh token)
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } = generateTokenPair(user);
    const newHash = hashToken(newRefreshToken);

    // Update stored hash (token rotation)
    const { error: rotateHashErr } = await supabaseAdmin
      .from('users')
      .update({ refresh_token_hash: newHash })
      .eq('id', user.id);
    if (rotateHashErr) {
      log.error('Failed to rotate refresh token hash', { error: rotateHashErr });
      return res.status(500).json({ error: 'Internal server error' });
    }

    setRefreshCookie(res, newRefreshToken);

    res.json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: shouldExposeRefreshToken(req) ? newRefreshToken : undefined,
      user: buildAuthUser(user),
    });
  } catch (error) {
    log.error('Token refresh error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout - invalidate refresh token + blacklist JWT
router.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // Clear refresh token
        const { error: clearTokenErr } = await supabaseAdmin
          .from('users')
          .update({ refresh_token_hash: null })
          .eq('id', decoded.id);
        if (clearTokenErr) log.warn('Error clearing refresh token on logout', { error: clearTokenErr });

        // Blacklist the JWT until its natural expiry
        const { blacklistToken } = await import('../middleware/auth.js');
        const ttl = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 30 * 24 * 60 * 60;
        if (ttl > 0) await blacklistToken(token, ttl);
      } catch {
        // Token expired or invalid — still clear on best effort
      }
    }
    res.clearCookie('refresh_token', { path: '/api/auth' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// OAuth routes - Google only (updated: redirect parameter support)
router.get('/oauth/google', (req, res) => {
  log.info('Initiating OAuth flow - v2');
  log.info('Redirect parameter', { redirect: req.query.redirect });

  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return res.status(500).json({
      error: 'Google OAuth not configured. Please set GOOGLE_CLIENT_ID in .env file'
    });
  }

  const appUrl = resolveAppUrl(req);
  const isMobile = req.query.mobile === 'true';

  // For mobile: redirect straight to backend callback so we can issue deep-link redirect.
  // For web: redirect to frontend /oauth/callback which then POSTs to backend.
  const redirectUri = isMobile
    ? encodeURIComponent(`${req.protocol}://${req.get('host')}/api/auth/oauth/callback`)
    : encodeURIComponent(`${appUrl}/oauth/callback`);

  // Only request basic profile scopes for authentication
  const scope = encodeURIComponent('email profile openid');

  // Build state data - include redirect parameter if provided
  const stateData = {
    provider: 'google',
    isAuth: true, // Mark this as authentication flow
    timestamp: Date.now(),
    mobile: isMobile, // Mobile app sets this for deep-link callback
    redirectUri: isMobile ? `${req.protocol}://${req.get('host')}/api/auth/oauth/callback` : `${appUrl}/oauth/callback`,
  };

  // Include beta invite code in state (survives OAuth round-trip)
  if (req.query.invite) {
    stateData.inviteCode = req.query.invite.trim();
  }

  // Discovery-confirmed users are pre-qualified for beta
  if (req.query.discovery === 'true') {
    stateData.discoveryConfirmed = true;
  }

  // Include redirect parameter in state if provided (relative paths only — prevent open redirect)
  if (req.query.redirect) {
    const redirectParam = req.query.redirect;
    const isSafeRelative = /^\/[^/\\]/.test(redirectParam); // Must start with / but not // (protocol-relative)
    if (isSafeRelative) {
      stateData.redirectAfterAuth = redirectParam;
      log.info('Including post-auth redirect in state', { redirect: redirectParam });
    } else {
      log.warn('Ignoring unsafe redirect param', { redirect: redirectParam });
    }
  }

  const state = encryptState(stateData, 'auth');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;

  log.info('Redirecting to Google OAuth');
  res.redirect(authUrl);
});

// Helper function to exchange Google auth code for tokens
// redirectUri can be the full callback URL, or we derive it from appUrl
async function exchangeGoogleCode(code, appUrl, overrideRedirectUri = null) {
  try {
    log.info('exchangeGoogleCode START', { codePrefix: code?.substring(0, 20), appUrl });

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    log.info('JWT_SECRET defined', { defined: !!process.env.JWT_SECRET });

    if (!clientId || !clientSecret) {
      log.error('Missing Google OAuth credentials');
      return null;
    }

    const redirectUri = overrideRedirectUri || `${appUrl}/oauth/callback`;
    log.info('Using redirectUri', { redirectUri });

    // Exchange code for tokens
    log.info('Calling Google token endpoint');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    log.info('Token response status', { status: tokenResponse.status });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      log.error('Token exchange failed', { status: tokenResponse.status, errorText });
      return null;
    }

    const tokens = await tokenResponse.json();
    log.info('Tokens received', { hasAccessToken: !!tokens.access_token });

    // Get user info
    log.info('Fetching user info from Google');
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });

    log.info('User info response status', { status: userResponse.status });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      log.error('Failed to get user info', { status: userResponse.status, errorText });
      return null;
    }

    const userData = await userResponse.json();
    log.info('User info received', { hasGivenName: !!userData.given_name });

    // nOAuth protection: reject unverified emails to prevent account takeover
    if (userData.verified_email === false) {
      log.warn('OAuth rejected: email not verified', { email: userData.email });
      return null;
    }

    const result = {
      email: userData.email,
      firstName: userData.given_name || '',
      lastName: userData.family_name || '',
      picture: userData.picture,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token
    };

    log.info('exchangeGoogleCode SUCCESS - returning user data');
    return result;
  } catch (error) {
    log.error('Google OAuth exception', { error });
    return null;
  }
}

// OAuth callback handler (GET for redirects)
router.get('/oauth/callback', async (req, res) => {
  // Declared outside try so catch block can use it for error redirect
  let appUrl = resolveAppUrl(req);

  try {
    const { code, state, error } = req.query;

    if (error) {
      log.error('OAuth error', { error });
      return res.redirect(`${appUrl}/auth?error=${error}`);
    }

    if (!code) {
      log.error('No authorization code received');
      return res.redirect(`${appUrl}/auth?error=no_code`);
    }

    // Decode state to get provider and userId
    let provider = 'google';
    let userId = null;
    let isConnectorFlow = false;
    let stateData = null;

    log.info('Auth GET callback - raw state received');

    try {
      stateData = decryptState(state);
      if (stateData) {
        log.info('Auth GET callback - decoded state', { provider: stateData.provider });
        provider = stateData.provider || 'google';
        userId = stateData.userId;
        isConnectorFlow = !!userId; // If userId exists, this is a connector OAuth flow
        log.info('Auth GET callback - flow detection', { provider, userId, isConnectorFlow });
      } else {
        log.info('Could not decode state (null result), defaulting to google');
      }
    } catch (e) {
      log.info('Could not decode state, defaulting to google');
    }

    let userData = null;

    // Check if this is a Google-based OAuth (auth or connector)
    const isGoogleBased = provider === 'google' || provider.startsWith('google_');

    // Check if this is an authentication flow
    const isAuthFlow = stateData && stateData.isAuth === true;

    if (isGoogleBased && code && (isAuthFlow || !isConnectorFlow)) {
      // Use redirectUri stored in state for mobile, fallback to appUrl-derived for web
      const storedRedirectUri = stateData?.redirectUri || null;
      userData = await exchangeGoogleCode(code, appUrl, storedRedirectUri);

      // If we failed to get real data, don't fall back to demo for auth flows
      if (!userData && isAuthFlow) {
        log.error('Failed to exchange Google OAuth code for authentication');
        return res.redirect(`${appUrl}/auth?error=oauth_failed`);
      }
    }

    // For connector OAuth, we don't need real user data - just store the connection
    if (isConnectorFlow) {
      log.info('Processing connector OAuth flow', { provider });

      // For Google-based connectors, exchange the code for tokens
      if (isGoogleBased && code) {
        const tokens = await exchangeGoogleCode(code, appUrl);
        if (tokens) {
          // Store the connection with encrypted tokens in database
          const connectionData = {
            user_id: userId,
            platform: provider,
            connected: true,
            access_token: encryptToken(tokens.accessToken || 'mock_token_' + Date.now()),
            refresh_token: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
            token_expires_at: null,
            scopes: [],
            metadata: {
              connected_at: new Date().toISOString(),
              last_sync: new Date().toISOString(),
              permissions: {},
              total_synced: 0,
              last_sync_status: 'success',
              error_count: 0
            }
          };

          const { error: dbError } = await supabaseAdmin
            .from('platform_connections')
            .upsert(connectionData, {
              onConflict: 'user_id,platform'
            });

          if (dbError) {
            log.error('Database error storing connector', { error: dbError });
          } else {
            log.info('Successfully stored connection in database', { provider, userId });
          }
        }
      }
      // Skip user creation for connector flows
    } else {
      // In development, create a mock user if OAuth exchange returned no data
      if (!userData) {
        if (process.env.NODE_ENV !== 'production') {
          log.warn('Using mock user for development (auth flow)');
          userData = {
            email: provider === 'google' ? 'demo@google.com' : `demo@${provider}.com`,
            firstName: provider.charAt(0).toUpperCase() + provider.slice(1),
            lastName: 'User'
          };
        } else {
          log.error('OAuth exchange returned no user data', { provider });
          return res.redirect(`${appUrl}/auth?error=${encodeURIComponent('OAuth authentication failed - no user data received')}`);
        }
      }
    }

    // Check if user exists or create new
    let { data: user, error: userFetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, first_name, last_name, picture_url, oauth_provider')
      .eq('email', userData.email)
      .single();

    if (!user) {
      // Beta gate: check invite code for new users
      let resolvedInviteCode = null;
      if (betaInviteService.isBetaGateEnabled()) {
        const inviteCode = stateData?.inviteCode;
        const preInvite = await betaInviteService.isEmailPreInvited(userData.email);
        resolvedInviteCode = inviteCode || preInvite?.code;

        if (!resolvedInviteCode) {
          log.info('New user rejected (no invite code)', { email: userData.email });
          betaInviteService.addToWaitlist(userData.email, `${userData.firstName || ''} ${userData.lastName || ''}`.trim(), 'rejected_signup').catch(() => {});
          return res.redirect(`${appUrl}/waitlist?email=${encodeURIComponent(userData.email)}`);
        }

        const validation = await betaInviteService.validateInviteCode(resolvedInviteCode);
        if (!validation.valid) {
          log.info('New user rejected (invalid invite)', { email: userData.email, error: validation.error });
          betaInviteService.addToWaitlist(userData.email, `${userData.firstName || ''} ${userData.lastName || ''}`.trim(), 'invalid_invite').catch(() => {});
          return res.redirect(`${appUrl}/waitlist?email=${encodeURIComponent(userData.email)}&error=${encodeURIComponent(validation.error)}`);
        }
      }

      // Create new user with encrypted tokens
      // Google OAuth users are auto-verified (Google already verified their email)
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          email: userData.email,
          first_name: userData.firstName,
          last_name: userData.lastName,
          oauth_platform: provider,
          picture_url: userData.picture,
          email_verified: true,
        })
        .select()
        .single();

      if (insertError) {
        log.error('Failed to create user', { error: insertError });
        throw new Error('User creation failed');
      }

      user = newUser;

      // Redeem invite code after successful user creation (reuse cached code)
      if (resolvedInviteCode) {
        betaInviteService.redeemInviteCode(resolvedInviteCode, user.id).catch(err =>
          log.error('Invite redeem failed (non-blocking)', { error: err })
        );
      }

      // Trigger background enrichment for new users
      // Save to enriched_profiles for display in onboarding, but do NOT seed memories yet.
      // Memory seeding happens only after user confirms via POST /api/enrichment/confirm.
      const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
      log.info('Triggering background enrichment for new user', { userId: user.id });
      profileEnrichmentService.enrichFromEmail(userData.email, fullName)
        .then(data => {
          if (data) return profileEnrichmentService.saveEnrichment(user.id, userData.email, data);
        })
        .catch(err => log.error('Enrichment failed (non-blocking)', { error: err }));

      // Send welcome email (non-blocking)
      sendWelcomeEmail({ toEmail: userData.email, firstName: userData.firstName }).catch(() => {});
    }

    // Handle redirect for connector OAuth flow
    if (isConnectorFlow && userId) {
      log.info('Processing connector OAuth in backend GET route');
      // Redirect back to get-started page with connected=true
      const redirectUrl = `${appUrl}/get-started?connected=true&provider=${provider}`;
      return res.redirect(redirectUrl);
    }

    // Generate token pair for regular user authentication
    const { accessToken, refreshToken } = generateTokenPair(user);
    const refreshTokenHash = hashToken(refreshToken);

    // Store refresh token hash
    const { error: getCallbackHashErr } = await supabaseAdmin
      .from('users')
      .update({ refresh_token_hash: refreshTokenHash })
      .eq('id', user.id);
    if (getCallbackHashErr) {
      log.error('Failed to store refresh token hash in GET callback', { error: getCallbackHashErr });
    }

    // Generate a one-time auth code to pass to the frontend — avoids tokens in the redirect URL
    // (tokens in URLs are logged by servers, stored in browser history, and leaked in Referer headers)
    // Stored in Supabase so all Vercel serverless instances share the same state
    const authCode = crypto.randomBytes(32).toString('hex');
    await supabaseAdmin.from('pending_auth_codes').insert({
      code: authCode,
      access_token: accessToken,
      refresh_token: refreshToken,
      provider,
      redirect_after_auth: stateData?.redirectAfterAuth || null,
      expires_at: new Date(Date.now() + 120_000).toISOString(),
    });

    // Mobile app flow: redirect to deep link instead of web app
    if (stateData?.mobile) {
      log.info('Mobile OAuth flow - redirecting to deep link');
      return res.redirect(`twinme://auth?auth_code=${authCode}`);
    }

    const redirectUrl = `${appUrl}/oauth/callback?auth_code=${authCode}&provider=${encodeURIComponent(provider)}`;
    res.redirect(redirectUrl);
  } catch (error) {
    log.error('OAuth callback error', { error });
    res.redirect(`${appUrl}/auth?error=callback_failed`);
  }
});

// OAuth callback handler (POST for API calls)
router.post('/oauth/callback', async (req, res) => {
  log.info('POST /oauth/callback received');

  try {
    const { code, state, provider } = req.body;

    log.info('POST /oauth/callback - received', { hasCode: !!code, hasState: !!state, provider });

    const appUrl = resolveAppUrl(req);
    log.info('Detected appUrl', { appUrl });

    // Decode state to check if this is a connector OAuth
    let stateData = null;
    let isConnectorFlow = false;
    try {
      if (state) {
        stateData = decryptState(state);
        isConnectorFlow = !!stateData.userId;
        log.info('Decoded state', { provider: stateData.provider, isConnectorFlow });
      }
    } catch (e) {
      log.info('Could not decode state');
    }

    let userData = null;

    // Check if this is a Google-based OAuth (auth or connector)
    const isGoogleBased = provider === 'google' || (provider && provider.startsWith('google_'));

    // Check if this is an authentication flow
    const isAuthFlow = stateData && stateData.isAuth === true;

    if (isGoogleBased && code && (isAuthFlow || !isConnectorFlow)) {
      // Real Google OAuth for authentication
      // Use the exact redirectUri from state to ensure it matches what Google received
      const exactRedirectUri = stateData?.redirectUri || null;
      log.info('Calling exchangeGoogleCode', { appUrl, exactRedirectUri });
      userData = await exchangeGoogleCode(code, appUrl, exactRedirectUri);
      log.info('exchangeGoogleCode result', { success: !!userData });

      // If we failed to get real data, don't fall back to demo for auth flows
      if (!userData && isAuthFlow) {
        log.error('Failed to exchange Google OAuth code for authentication (POST)');
        return res.status(400).json({
          success: false,
          error: 'Failed to authenticate with Google'
        });
      }
    }

    // For connector OAuth, we don't need real user data - just store the connection
    if (isConnectorFlow) {
      log.info('Processing connector OAuth flow', { provider });

      // For Google-based connectors, exchange the code for tokens
      if (isGoogleBased && code) {
        const tokens = await exchangeGoogleCode(code, appUrl);
        if (tokens) {
          // Store the connection with encrypted tokens in database
          const connectionData = {
            user_id: stateData.userId,
            platform: provider,
            connected: true,
            access_token: encryptToken(tokens.accessToken || 'mock_token_' + Date.now()),
            refresh_token: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
            token_expires_at: null,
            scopes: [],
            metadata: {
              connected_at: new Date().toISOString(),
              last_sync: new Date().toISOString(),
              permissions: {},
              total_synced: 0,
              last_sync_status: 'success',
              error_count: 0
            }
          };

          const { error: dbError } = await supabaseAdmin
            .from('platform_connections')
            .upsert(connectionData, {
              onConflict: 'user_id,platform'
            });

          if (dbError) {
            log.error('Database error storing connector', { error: dbError });
          } else {
            log.info('Successfully stored connection in database', { provider, userId: stateData.userId });
          }
        }
      }
      // Skip user creation for connector flows
    } else {
      // In development, create a mock user if OAuth exchange returned no data
      if (!userData) {
        if (process.env.NODE_ENV !== 'production') {
          log.warn('Using mock user for development (auth flow)');
          userData = {
            email: provider === 'google' ? 'demo@google.com' : `demo@${provider}.com`,
            firstName: provider.charAt(0).toUpperCase() + provider.slice(1),
            lastName: 'User'
          };
        } else {
          log.error('OAuth exchange returned no user data', { provider });
          return res.status(400).json({
            success: false,
            error: 'OAuth authentication failed - no user data received'
          });
        }
      }
    }

    // Check if user exists or create new (only for auth flows, not connector flows)
    let user = null;
    let isNewUser = false;

    log.info('Checking user', { isConnectorFlow, hasUserData: !!userData });

    if (!isConnectorFlow && userData) {
      log.info('Querying for existing user');
      let existingUser, userFetchError;
      try {
        const result = await Promise.race([
          supabaseAdmin
            .from('users')
            .select('id, email, first_name, last_name, picture_url, oauth_provider, created_at')
            .eq('email', userData.email)
            .single(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Database timeout')), 10000)
          )
        ]);
        existingUser = result.data;
        userFetchError = result.error;
      } catch (dbErr) {
        log.error('Auth DB query timed out or failed', { error: dbErr });
        return res.status(503).json({ success: false, error: 'Service temporarily unavailable. Please try again in a moment.' });
      }

      log.info('Existing user query result', { found: !!existingUser, error: userFetchError });

      if (!existingUser) {
        // Beta gate: check invite code for new users (POST callback)
        // Discovery-confirmed users bypass the invite gate (they completed the discovery flow)
        let resolvedInviteCodePost = null;
        const discoveryBypass = stateData?.discoveryConfirmed === true;
        if (betaInviteService.isBetaGateEnabled() && !discoveryBypass) {
          const inviteCode = stateData?.inviteCode || req.body?.inviteCode;
          const preInvite = await betaInviteService.isEmailPreInvited(userData.email);
          resolvedInviteCodePost = inviteCode || preInvite?.code;

          if (!resolvedInviteCodePost) {
            log.info('New user rejected via POST (no invite)', { email: userData.email });
            betaInviteService.addToWaitlist(userData.email, `${userData.firstName || ''} ${userData.lastName || ''}`.trim(), 'rejected_signup').catch(() => {});
            return res.status(403).json({ success: false, error: 'Beta invite code required', waitlist: true });
          }

          const validation = await betaInviteService.validateInviteCode(resolvedInviteCodePost);
          if (!validation.valid) {
            log.info('New user rejected via POST (invalid invite)', { email: userData.email });
            return res.status(403).json({ success: false, error: validation.error, waitlist: true });
          }
        }
        if (discoveryBypass) {
          log.info('Discovery-confirmed user bypassing beta gate', { email: userData.email });
        }

        // Create new user
        // Google OAuth users are auto-verified (Google already verified their email)
        log.info('Creating new user');
        let newUser, insertError;
        try {
          const insertResult = await Promise.race([
            supabaseAdmin
              .from('users')
              .insert({
                email: userData.email,
                first_name: userData.firstName,
                last_name: userData.lastName,
                oauth_provider: provider,
                picture_url: userData.picture,
                email_verified: true,
              })
              .select()
              .single(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Database timeout')), 10000)
            )
          ]);
          newUser = insertResult.data;
          insertError = insertResult.error;
        } catch (dbErr) {
          log.error('Auth user insert timed out or failed', { error: dbErr });
          return res.status(503).json({ success: false, error: 'Service temporarily unavailable. Please try again in a moment.' });
        }

        if (insertError) {
          log.error('Failed to create user', { error: insertError });
          throw new Error('User creation failed');
        }

        log.info('New user created', { userId: newUser.id });
        user = newUser;
        isNewUser = true;

        // Redeem invite code after user creation (reuse cached code)
        if (resolvedInviteCodePost) {
          betaInviteService.redeemInviteCode(resolvedInviteCodePost, user.id).catch(err =>
            log.error('Invite redeem failed (non-blocking)', { error: err })
          );
        }

        // Trigger background enrichment for new users
        // Save to enriched_profiles for display in onboarding, but do NOT seed memories yet.
        // Memory seeding happens only after user confirms via POST /api/enrichment/confirm.
        const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
        log.info('Triggering background enrichment for new user', { userId: user.id });
        profileEnrichmentService.enrichFromEmail(userData.email, fullName)
          .then(data => {
            if (data) return profileEnrichmentService.saveEnrichment(user.id, userData.email, data);
          })
          .catch(err => log.error('Enrichment failed (non-blocking)', { error: err }));

        // Send welcome email (non-blocking)
        sendWelcomeEmail({ toEmail: userData.email, firstName: userData.firstName }).catch(() => {});
      } else {
        log.info('Existing user found', { userId: existingUser.id });
        user = existingUser;
      }
    }

    // Handle response based on flow type
    log.info('Determining response type', { isConnectorFlow, hasUser: !!user });

    if (isConnectorFlow) {
      // For connector flows, just return success
      log.info('Returning connector success');
      res.json({
        success: true,
        message: 'Connector authenticated successfully',
        provider: provider
      });
    } else if (user) {
      // Generate token pair for auth flows
      log.info('Generating token pair for user', { userId: user.id });
      const { accessToken, refreshToken } = generateTokenPair(user);
      const refreshTokenHash = hashToken(refreshToken);

      // Store refresh token hash
      const { error: postCallbackHashErr } = await supabaseAdmin
        .from('users')
        .update({ refresh_token_hash: refreshTokenHash })
        .eq('id', user.id);
      if (postCallbackHashErr) {
        log.error('Failed to store refresh token hash in POST callback', { error: postCallbackHashErr });
      }

      log.info('Returning auth success with token');

      setRefreshCookie(res, refreshToken);

      // Build response data
      const responseData = {
        success: true,
        token: accessToken,
        isNewUser,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          fullName: `${user.first_name} ${user.last_name}`.trim()
        }
      };

      // Include redirect parameter if present in state
      if (stateData && stateData.redirectAfterAuth) {
        responseData.redirectAfterAuth = stateData.redirectAfterAuth;
        log.info('Including redirect in response', { redirect: stateData.redirectAfterAuth });
      }

      res.json(responseData);
    } else {
      log.error('No user and not connector flow - authentication failed');
      throw new Error('Authentication failed');
    }
  } catch (error) {
    log.error('OAuth callback error (POST)', { error });
    res.status(500).json({ error: 'OAuth authentication failed' });
  }
});

// Exchange one-time auth code for tokens — called by frontend after GET redirect
// Tokens are stored in Supabase to avoid exposing them in URLs and to work across serverless instances
router.get('/oauth/claim', async (req, res) => {
  const { auth_code: authCode } = req.query;

  if (!authCode || typeof authCode !== 'string') {
    return res.status(400).json({ error: 'Missing auth_code' });
  }

  const { data: session, error } = await supabaseAdmin
    .from('pending_auth_codes')
    .select('*')
    .eq('code', authCode)
    .single();

  if (error || !session) {
    return res.status(404).json({ error: 'Invalid or expired auth code' });
  }

  if (new Date(session.expires_at) < new Date()) {
    await supabaseAdmin.from('pending_auth_codes').delete().eq('code', authCode);
    return res.status(410).json({ error: 'Auth code expired' });
  }

  // One-time use — delete immediately after claim
  await supabaseAdmin.from('pending_auth_codes').delete().eq('code', authCode);

  // Set refresh token as httpOnly cookie instead of exposing in response body
  if (session.refresh_token) {
    setRefreshCookie(res, session.refresh_token);
  }

  return res.json({
    success: true,
    token: session.access_token,
    refreshToken: shouldExposeRefreshToken(req) ? session.refresh_token : undefined,
    provider: session.provider,
    redirectAfterAuth: session.redirect_after_auth || null,
  });
});

// Email verification endpoint
// GET /api/auth/verify-email?token=X — marks the user's email as verified
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string' || token.length !== 64) {
      return res.status(400).json({ success: false, error: 'Invalid verification token' });
    }

    // Find user by verification token
    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, email_verified, email_verification_token_expires_at')
      .eq('email_verification_token', token)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ success: false, error: 'Invalid or expired verification token' });
    }

    // Check if already verified
    if (user.email_verified) {
      const appUrl = resolveAppUrl(req);
      return res.redirect(`${appUrl}/auth?verified=already`);
    }

    // Check token expiry
    if (user.email_verification_token_expires_at && new Date(user.email_verification_token_expires_at) < new Date()) {
      return res.status(410).json({ success: false, error: 'Verification token has expired. Please request a new one.' });
    }

    // Mark email as verified and clear the token
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        email_verified: true,
        email_verification_token: null,
        email_verification_token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      log.error('Failed to verify email', { error: updateError, userId: user.id });
      return res.status(500).json({ success: false, error: 'Failed to verify email' });
    }

    log.info('Email verified successfully', { userId: user.id, email: user.email });

    // Redirect to app with success indicator
    const appUrl = resolveAppUrl(req);
    return res.redirect(`${appUrl}/auth?verified=true`);
  } catch (error) {
    log.error('Email verification error', { error });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
