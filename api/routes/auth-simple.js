import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { encryptToken, encryptState, decryptState } from '../services/encryption.js';
import profileEnrichmentService from '../services/profileEnrichmentService.js';
import { getRedisClient, isRedisAvailable } from '../services/redisClient.js';

const AUTH_LOCKOUT_THRESHOLD = 10; // failed attempts before lockout
const AUTH_LOCKOUT_TTL = 15 * 60; // 15 minutes in seconds

/**
 * Increment the failed-login counter for an account. Returns true if account is now locked.
 */
async function trackAuthFailure(email) {
  try {
    const client = getRedisClient();
    if (!client || !isRedisAvailable()) return false;
    const key = `authFailures:${email}`;
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, AUTH_LOCKOUT_TTL); // Set TTL on first failure
    return count > AUTH_LOCKOUT_THRESHOLD;
  } catch { return false; }
}

/**
 * Returns true if this account has exceeded the failed-login threshold.
 */
async function isAccountLocked(email) {
  try {
    const client = getRedisClient();
    if (!client || !isRedisAvailable()) return false;
    const count = parseInt(await client.get(`authFailures:${email}`) || '0', 10);
    return count > AUTH_LOCKOUT_THRESHOLD;
  } catch { return false; }
}

/**
 * Clear failed-login counter on successful login.
 */
async function clearAuthFailures(email) {
  try {
    const client = getRedisClient();
    if (!client || !isRedisAvailable()) return;
    await client.del(`authFailures:${email}`);
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

// JWT secret - required environment variable
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
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

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Basic input validation
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
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

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

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
      console.error('Database error:', insertError);
      return res.status(500).json({ error: 'Failed to create user' });
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
      console.error('Failed to store refresh token hash on signup:', signupHashErr.message);
    }

    // Trigger background enrichment for email signup users
    const fullName = `${(firstName || '').trim()} ${(lastName || '').trim()}`.trim();
    profileEnrichmentService.enrichFromEmail(normalizedEmail, fullName)
      .then(data => {
        if (data) {
          return profileEnrichmentService.saveEnrichment(newUser.id, normalizedEmail, data);
        }
      })
      .then(() => console.log('✅ Enrichment completed for email signup user:', newUser.id))
      .catch(err => console.error('⚠️ Enrichment failed (non-blocking):', err.message));

    res.json({
      success: true,
      token: accessToken,
      refreshToken,
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        fullName: `${newUser.first_name} ${newUser.last_name}`.trim()
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sign in
router.post('/signin', async (req, res) => {
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
      .select('id, email, first_name, last_name, password_hash')
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
      console.error('Failed to store refresh token hash on signin:', signinHashErr.message);
    }

    res.json({
      success: true,
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name}`.trim()
      }
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Get user data
    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, first_name, last_name')
      .eq('id', decoded.id)
      .single();

    if (fetchError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name}`.trim()
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Refresh access token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const tokenHash = hashToken(refreshToken);

    // Find user by refresh token hash
    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, first_name, last_name')
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
      console.error('Failed to rotate refresh token hash:', rotateHashErr.message);
      return res.status(500).json({ error: 'Internal server error' });
    }

    res.json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name}`.trim()
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
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
        if (clearTokenErr) console.warn('[Auth] Error clearing refresh token on logout:', clearTokenErr.message);

        // Blacklist the JWT until its natural expiry
        const { blacklistToken } = await import('../middleware/auth.js');
        const ttl = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 30 * 24 * 60 * 60;
        if (ttl > 0) await blacklistToken(token, ttl);
      } catch {
        // Token expired or invalid — still clear on best effort
      }
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// OAuth routes - Google only (updated: redirect parameter support)
router.get('/oauth/google', (req, res) => {
  console.log('🔵 [OAuth Google GET] Initiating OAuth flow - v2');
  console.log('🔵 [OAuth Google GET] Redirect parameter:', req.query.redirect);

  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return res.status(500).json({
      error: 'Google OAuth not configured. Please set GOOGLE_CLIENT_ID in .env file'
    });
  }

  // Auto-detect production URL from request or use environment variable
  let appUrl;
  if (process.env.APP_URL) {
    appUrl = process.env.APP_URL;
  } else if (req.get('host')?.includes('vercel.app')) {
    // IMPORTANT: Always use the production domain for OAuth, not deployment-specific URLs
    // This ensures redirect_uri matches between authorization and token exchange
    appUrl = 'https://twin-ai-learn.vercel.app';
  } else {
    // Local development fallback
    appUrl = process.env.VITE_APP_URL || 'http://localhost:8086';
  }

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

  // Include redirect parameter in state if provided (relative paths only — prevent open redirect)
  if (req.query.redirect) {
    const redirectParam = req.query.redirect;
    const isSafeRelative = /^\/[^/\\]/.test(redirectParam); // Must start with / but not // (protocol-relative)
    if (isSafeRelative) {
      stateData.redirectAfterAuth = redirectParam;
      console.log('🔵 [OAuth Google GET] Including post-auth redirect in state:', redirectParam);
    } else {
      console.warn('🔵 [OAuth Google GET] Ignoring unsafe redirect param:', redirectParam);
    }
  }

  const state = encryptState(stateData, 'auth');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;

  console.log('🔵 [OAuth Google GET] Redirecting to Google OAuth...');
  res.redirect(authUrl);
});

// Helper function to exchange Google auth code for tokens
// redirectUri can be the full callback URL, or we derive it from appUrl
async function exchangeGoogleCode(code, appUrl, overrideRedirectUri = null) {
  try {
    console.log('🟢 exchangeGoogleCode START');
    console.log('🟢 code:', code?.substring(0, 20) + '...');
    console.log('🟢 appUrl:', appUrl);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    console.log('🟢 JWT_SECRET defined:', !!process.env.JWT_SECRET);

    if (!clientId || !clientSecret) {
      console.error('❌ Missing Google OAuth credentials');
      return null;
    }

    const redirectUri = overrideRedirectUri || `${appUrl}/oauth/callback`;
    console.log('🟢 redirectUri:', redirectUri);

    // Exchange code for tokens
    console.log('🟢 Calling Google token endpoint...');
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

    console.log('🟢 Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Token exchange failed:', tokenResponse.status, errorText);
      return null;
    }

    const tokens = await tokenResponse.json();
    console.log('✅ Tokens received, has access_token:', !!tokens.access_token);

    // Get user info
    console.log('🟢 Fetching user info from Google...');
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });

    console.log('🟢 User info response status:', userResponse.status);

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error('❌ Failed to get user info:', userResponse.status, errorText);
      return null;
    }

    const userData = await userResponse.json();
    console.log('✅ User info received, hasGivenName:', !!userData.given_name);

    // nOAuth protection: reject unverified emails to prevent account takeover
    if (userData.verified_email === false) {
      console.warn('[Auth] ⚠️ OAuth rejected: email not verified for', userData.email);
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

    console.log('✅ exchangeGoogleCode SUCCESS - returning user data');
    return result;
  } catch (error) {
    console.error('❌ Google OAuth exception:', error);
    console.error('❌ Exception stack:', error.stack);
    return null;
  }
}

// OAuth callback handler (GET for redirects)
router.get('/oauth/callback', async (req, res) => {
  // Declared outside try so catch block can use it for error redirect
  let appUrl = process.env.APP_URL
    || (req.get('host')?.includes('vercel.app') ? 'https://twin-ai-learn.vercel.app' : null)
    || process.env.VITE_APP_URL
    || 'http://localhost:8086';

  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error('OAuth error:', error);
      return res.redirect(`${appUrl}/auth?error=${error}`);
    }

    if (!code) {
      console.error('No authorization code received');
      return res.redirect(`${appUrl}/auth?error=no_code`);
    }

    // Decode state to get provider and userId
    let provider = 'google';
    let userId = null;
    let isConnectorFlow = false;
    let stateData = null;

    console.log('🔍 Auth GET callback - raw state:', state);

    try {
      stateData = decryptState(state);
      if (stateData) {
        console.log('🔍 Auth GET callback - decoded state provider:', stateData.provider);
        provider = stateData.provider || 'google';
        userId = stateData.userId;
        isConnectorFlow = !!userId; // If userId exists, this is a connector OAuth flow
        console.log('🔍 Auth GET callback - flow detection:', { provider, userId, isConnectorFlow });
      } else {
        console.log('Could not decode state (null result), defaulting to google');
      }
    } catch (e) {
      console.log('Could not decode state, defaulting to google');
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
        console.error('Failed to exchange Google OAuth code for authentication');
        return res.redirect(`${appUrl}/auth?error=oauth_failed`);
      }
    }

    // For connector OAuth, we don't need real user data - just store the connection
    if (isConnectorFlow) {
      console.log('Processing connector OAuth flow for:', provider);

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
            console.error('Database error storing connector:', dbError);
          } else {
            console.log(`✅ Successfully stored ${provider} connection for user ${userId} in database`);
          }
        }
      }
      // Skip user creation for connector flows
    } else {
      // In development, create a mock user if OAuth exchange returned no data
      if (!userData) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[Auth] Using mock user for development (auth flow)');
          userData = {
            email: provider === 'google' ? 'demo@google.com' : `demo@${provider}.com`,
            firstName: provider.charAt(0).toUpperCase() + provider.slice(1),
            lastName: 'User'
          };
        } else {
          console.error(`[Auth] OAuth exchange returned no user data for provider: ${provider}`);
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
      // Create new user with encrypted tokens
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          email: userData.email,
          first_name: userData.firstName,
          last_name: userData.lastName,
          oauth_platform: provider,
          picture_url: userData.picture
        })
        .select()
        .single();

      if (insertError) {
        console.error('Failed to create user:', insertError);
        throw new Error('User creation failed');
      }

      user = newUser;

      // Trigger background enrichment for new users
      const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
      console.log('🔍 Triggering background enrichment for new user:', user.id);
      profileEnrichmentService.enrichFromEmail(userData.email, fullName)
        .then(data => {
          if (data) {
            return profileEnrichmentService.saveEnrichment(user.id, userData.email, data);
          }
        })
        .then(() => console.log('✅ Enrichment completed for user:', user.id))
        .catch(err => console.error('⚠️ Enrichment failed (non-blocking):', err.message));
    }

    // Handle redirect for connector OAuth flow
    if (isConnectorFlow && userId) {
      console.log('🔗 Processing connector OAuth in backend GET route');
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
      console.error('Failed to store refresh token hash in GET callback:', getCallbackHashErr.message);
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
      console.log('📱 Mobile OAuth flow — redirecting to deep link');
      return res.redirect(`twinme://auth?auth_code=${authCode}`);
    }

    const redirectUrl = `${appUrl}/oauth/callback?auth_code=${authCode}&provider=${encodeURIComponent(provider)}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${appUrl}/auth?error=callback_failed`);
  }
});

// OAuth callback handler (POST for API calls)
router.post('/oauth/callback', async (req, res) => {
  console.log('🟡 POST /oauth/callback received');

  try {
    const { code, state, provider } = req.body;

    console.log('🔵 POST /oauth/callback - received:', { hasCode: !!code, hasState: !!state, provider });

    // Auto-detect production URL from request or use environment variable
    let appUrl;
    if (process.env.APP_URL) {
      appUrl = process.env.APP_URL;
    } else if (req.get('host')?.includes('vercel.app')) {
      // IMPORTANT: Always use the production domain for OAuth, not deployment-specific URLs
      // This ensures redirect_uri matches between authorization and token exchange
      appUrl = 'https://twin-ai-learn.vercel.app';
    } else {
      // Local development fallback
      appUrl = process.env.VITE_APP_URL || 'http://localhost:8086';
    }

    console.log('🔵 Detected appUrl:', appUrl);

    // Decode state to check if this is a connector OAuth
    let stateData = null;
    let isConnectorFlow = false;
    try {
      if (state) {
        stateData = decryptState(state);
        isConnectorFlow = !!stateData.userId;
        console.log('🔵 Decoded state provider:', stateData.provider);
        console.log('🔵 isConnectorFlow:', isConnectorFlow);
      }
    } catch (e) {
      console.log('Could not decode state');
    }

    let userData = null;

    // Check if this is a Google-based OAuth (auth or connector)
    const isGoogleBased = provider === 'google' || (provider && provider.startsWith('google_'));

    // Check if this is an authentication flow
    const isAuthFlow = stateData && stateData.isAuth === true;

    if (isGoogleBased && code && (isAuthFlow || !isConnectorFlow)) {
      // Real Google OAuth for authentication
      console.log('🔵 Calling exchangeGoogleCode with appUrl:', appUrl);
      userData = await exchangeGoogleCode(code, appUrl);
      console.log('🔵 exchangeGoogleCode result:', userData ? 'success' : 'null');

      // If we failed to get real data, don't fall back to demo for auth flows
      if (!userData && isAuthFlow) {
        console.error('Failed to exchange Google OAuth code for authentication (POST)');
        return res.status(400).json({
          success: false,
          error: 'Failed to authenticate with Google'
        });
      }
    }

    // For connector OAuth, we don't need real user data - just store the connection
    if (isConnectorFlow) {
      console.log('Processing connector OAuth flow for:', provider);

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
            console.error('Database error storing connector:', dbError);
          } else {
            console.log(`✅ Successfully stored ${provider} connection for user ${stateData.userId} in database`);
          }
        }
      }
      // Skip user creation for connector flows
    } else {
      // In development, create a mock user if OAuth exchange returned no data
      if (!userData) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[Auth] Using mock user for development (auth flow)');
          userData = {
            email: provider === 'google' ? 'demo@google.com' : `demo@${provider}.com`,
            firstName: provider.charAt(0).toUpperCase() + provider.slice(1),
            lastName: 'User'
          };
        } else {
          console.error(`[Auth] OAuth exchange returned no user data for provider: ${provider}`);
          return res.status(400).json({
            success: false,
            error: 'OAuth authentication failed - no user data received'
          });
        }
      }
    }

    // Check if user exists or create new (only for auth flows, not connector flows)
    let user = null;

    console.log('🔵 Checking user:', { isConnectorFlow, hasUserData: !!userData });

    if (!isConnectorFlow && userData) {
      console.log('🔵 Querying for existing user');
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
        console.error('❌ Auth DB query timed out or failed:', dbErr.message);
        return res.status(503).json({ success: false, error: 'Service temporarily unavailable. Please try again in a moment.' });
      }

      console.log('🔵 Existing user query result:', { found: !!existingUser, error: userFetchError });

      if (!existingUser) {
        // Create new user
        console.log('🔵 Creating new user');
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
                picture_url: userData.picture
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
          console.error('❌ Auth user insert timed out or failed:', dbErr.message);
          return res.status(503).json({ success: false, error: 'Service temporarily unavailable. Please try again in a moment.' });
        }

        if (insertError) {
          console.error('❌ Failed to create user:', insertError.message);
          throw new Error('User creation failed');
        }

        console.log('✅ New user created:', newUser.id);
        user = newUser;

        // Trigger background enrichment for new users
        const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
        console.log('🔍 Triggering background enrichment for new user:', user.id);
        profileEnrichmentService.enrichFromEmail(userData.email, fullName)
          .then(data => {
            if (data) {
              return profileEnrichmentService.saveEnrichment(user.id, userData.email, data);
            }
          })
          .then(() => console.log('✅ Enrichment completed for user:', user.id))
          .catch(err => console.error('⚠️ Enrichment failed (non-blocking):', err.message));
      } else {
        console.log('✅ Existing user found:', existingUser.id);
        user = existingUser;
      }
    }

    // Handle response based on flow type
    console.log('🔵 Determining response type:', { isConnectorFlow, hasUser: !!user });

    if (isConnectorFlow) {
      // For connector flows, just return success
      console.log('✅ Returning connector success');
      res.json({
        success: true,
        message: 'Connector authenticated successfully',
        provider: provider
      });
    } else if (user) {
      // Generate token pair for auth flows
      console.log('✅ Generating token pair for user:', user.id);
      const { accessToken, refreshToken } = generateTokenPair(user);
      const refreshTokenHash = hashToken(refreshToken);

      // Store refresh token hash
      const { error: postCallbackHashErr } = await supabaseAdmin
        .from('users')
        .update({ refresh_token_hash: refreshTokenHash })
        .eq('id', user.id);
      if (postCallbackHashErr) {
        console.error('Failed to store refresh token hash in POST callback:', postCallbackHashErr.message);
      }

      console.log('✅ Returning auth success with token');

      // Build response data
      const responseData = {
        success: true,
        token: accessToken,
        refreshToken,
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
        console.log('✅ Including redirect in response:', stateData.redirectAfterAuth);
      }

      res.json(responseData);
    } else {
      console.error('❌ No user and not connector flow - authentication failed');
      throw new Error('Authentication failed');
    }
  } catch (error) {
    console.error('❌ OAuth callback error (caught in catch block):', error);
    console.error('❌ Error stack:', error.stack);
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

  return res.json({
    success: true,
    token: session.access_token,
    refreshToken: session.refresh_token,
    provider: session.provider,
    redirectAfterAuth: session.redirect_after_auth || null,
  });
});

export default router;