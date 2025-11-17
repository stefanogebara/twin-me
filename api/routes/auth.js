import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// JWT secret - MUST be set in environment variables
// This will throw an error on server startup if not configured (see server.js)
if (!process.env.JWT_SECRET) {
  throw new Error(
    'CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not set. ' +
    'Generate a secure secret using: node api/utils/generateSecret.js'
  );
}

const JWT_SECRET = process.env.JWT_SECRET;

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user in database
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: hashedPassword,
        first_name: firstName,
        last_name: lastName,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Signup error:', error);
      return res.status(400).json({ error: 'Failed to create user' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        fullName: `${newUser.first_name} ${newUser.last_name}`
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sign in
router.post('/signin', async (req, res) => {
  console.log('[Auth] Signin request received:', req.body.email); // Trigger restart
  console.log('[Auth] NODE_ENV:', process.env.NODE_ENV);
  console.log('[Auth] Email check:', req.body.email === 'test@example.com');
  console.log('[Auth] Password check:', req.body.password === 'test123');

  try {
    const { email, password } = req.body;

    // Development test user bypass
    if (process.env.NODE_ENV === 'development' &&
        email === 'test@example.com' &&
        password === 'test123') {
      console.log('[Auth] TEST USER BYPASS ACTIVATED!');
      const testUser = {
        id: 'test-user-123',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        created_at: new Date().toISOString()
      };

      const token = jwt.sign(
        { id: testUser.id, email: testUser.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        token,
        user: {
          id: testUser.id,
          email: testUser.email,
          firstName: testUser.first_name,
          lastName: testUser.last_name,
          fullName: `${testUser.first_name} ${testUser.last_name}`
        }
      });
    }

    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      console.log('User not found:', email);
      return res.status(400).json({ error: 'User not found. Please sign up first.' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Incorrect password. Please try again.' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name}`
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
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.id)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name}`
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// OAuth routes
router.get('/oauth/google', (req, res) => {
  console.log('🔵 [OAuth Google GET] Initiating OAuth flow');
  console.log('🔵 [OAuth Google GET] VITE_API_URL:', process.env.VITE_API_URL);
  console.log('🔵 [OAuth Google GET] GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing');
  console.log('🔵 [OAuth Google GET] Redirect parameter:', req.query.redirect);

  const clientId = process.env.GOOGLE_CLIENT_ID || 'your-google-client-id';
  const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`);
  const scope = encodeURIComponent('email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly');

  // Include redirect parameter in state if provided
  const stateData = {
    provider: 'google',
    timestamp: Date.now(),
    isAuth: true  // Mark this as an authentication OAuth flow
  };

  if (req.query.redirect) {
    stateData.redirectAfterAuth = req.query.redirect;
    console.log('🔵 [OAuth Google GET] Including post-auth redirect in state:', req.query.redirect);
  }

  const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

  console.log('🔵 [OAuth Google GET] Redirect URI (decoded):', decodeURIComponent(redirectUri));

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&access_type=offline&prompt=consent&state=${state}`;

  console.log('🔵 [OAuth Google GET] Redirecting to Google OAuth...');
  res.redirect(authUrl);
});

router.get('/oauth/microsoft', (req, res) => {
  const clientId = process.env.MICROSOFT_CLIENT_ID || 'your-microsoft-client-id';
  const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL}/oauth/callback`);
  const scope = encodeURIComponent('openid profile email User.Read Mail.Read Calendars.Read');
  const state = Buffer.from(JSON.stringify({
    provider: 'microsoft',
    timestamp: Date.now(),
    isAuth: true  // Mark this as an authentication OAuth flow
  })).toString('base64');

  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&state=${state}`;

  res.redirect(authUrl);
});

router.get('/oauth/apple', (req, res) => {
  const clientId = process.env.APPLE_CLIENT_ID || 'your-apple-client-id';
  const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL}/oauth/callback`);
  const scope = encodeURIComponent('name email');
  const state = Buffer.from(JSON.stringify({
    provider: 'apple',
    timestamp: Date.now(),
    isAuth: true  // Mark this as an authentication OAuth flow
  })).toString('base64');

  const authUrl = `https://appleid.apple.com/auth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&response_mode=form_post&state=${state}`;

  res.redirect(authUrl);
});

// OAuth callback handler (GET request from OAuth providers)
router.get('/callback', async (req, res) => {
  console.log('🟢 [Auth GET Callback] Received callback from OAuth provider');
  console.log('🟢 [Auth GET Callback] Query params:', { code: req.query.code ? '✅ Present' : '❌ Missing', state: req.query.state ? '✅ Present' : '❌ Missing' });
  console.log('🟢 [Auth GET Callback] Headers:', req.headers);

  try {
    const { code, state } = req.query;

    if (!code || !state) {
      console.error('❌ [Auth GET Callback] Missing code or state');
      return res.redirect(`${process.env.VITE_APP_URL || 'http://localhost:8086'}/auth?error=missing_parameters`);
    }

    // Decode state to get provider info
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
      console.log('🟢 [Auth GET Callback] Decoded state:', stateData);
    } catch (err) {
      console.error('❌ [Auth GET Callback] Failed to decode state:', err);
      return res.redirect(`${process.env.VITE_APP_URL || 'http://localhost:8086'}/auth?error=invalid_state`);
    }

    const provider = stateData.provider;
    console.log('🟢 [Auth GET Callback] Provider:', provider);

    // Exchange code for tokens based on provider
    let userData;
    if (provider === 'google') {
      userData = await exchangeGoogleCode(code);
    } else if (provider === 'microsoft') {
      userData = await exchangeMicrosoftCode(code);
    } else if (provider === 'apple') {
      userData = await exchangeAppleCode(code);
    }

    if (!userData) {
      console.error('Failed to exchange OAuth code for user data');
      return res.redirect(`${process.env.VITE_APP_URL || 'http://localhost:8086'}/auth?error=authentication_failed`);
    }

    // Check if user exists or create new user
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', userData.email)
      .single();

    let isNewUser = false;

    if (!user) {
      // Create new user
      isNewUser = true;
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          email: userData.email,
          first_name: userData.firstName,
          last_name: userData.lastName,
          picture_url: userData.pictureUrl,
          oauth_platform: provider,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('OAuth user creation error:', error);
        return res.redirect(`${process.env.VITE_APP_URL || 'http://localhost:8086'}/auth?error=user_creation_failed`);
      }

      user = newUser;
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Redirect to frontend with token and new user flag
    const frontendUrl = process.env.VITE_APP_URL || 'http://localhost:8086';
    // Redirect to dashboard with token as URL parameter (frontend will store in localStorage)
    res.redirect(`${frontendUrl}/auth/callback?token=${token}&isNewUser=${isNewUser}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env.VITE_APP_URL || 'http://localhost:8086'}/auth?error=server_error`);
  }
});

// OAuth callback handler (POST request from frontend)
router.post('/callback', async (req, res) => {
  console.log('🟣 [Auth POST Callback] Received POST callback from frontend');
  console.log('🟣 [Auth POST Callback] Headers:', req.headers);
  console.log('🟣 [Auth POST Callback] Body:', req.body);
  console.log('🟣 [Auth POST Callback] Content-Type:', req.get('Content-Type'));

  try {
    const { code, state, provider: explicitProvider } = req.body;

    console.log('🔵 [Auth OAuth POST] Received callback:', {
      hasCode: !!code,
      hasState: !!state,
      explicitProvider
    });

    if (!code || !state) {
      console.error('❌ [Auth OAuth POST] Missing code or state');
      return res.status(400).json({
        success: false,
        error: 'Missing code or state parameter'
      });
    }

    // Decode state to get provider info
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
      console.log('🔍 [Auth OAuth POST] Decoded state:', stateData);
    } catch (err) {
      console.error('❌ [Auth OAuth POST] Failed to decode state:', err);
      return res.status(400).json({
        success: false,
        error: 'Invalid state parameter'
      });
    }

    const provider = explicitProvider || stateData.provider;
    console.log('🔍 [Auth OAuth POST] Using provider:', provider);

    // Exchange code for tokens based on provider
    let userData;
    if (provider === 'google') {
      userData = await exchangeGoogleCode(code);
    } else if (provider === 'microsoft') {
      userData = await exchangeMicrosoftCode(code);
    } else if (provider === 'apple') {
      userData = await exchangeAppleCode(code);
    } else {
      console.error('❌ [Auth OAuth POST] Unsupported provider:', provider);
      return res.status(400).json({
        success: false,
        error: `Unsupported provider: ${provider}`
      });
    }

    if (!userData) {
      console.error('❌ [Auth OAuth POST] Failed to exchange OAuth code for user data');
      return res.status(400).json({
        success: false,
        error: 'Failed to exchange authorization code'
      });
    }

    console.log('✅ [Auth OAuth POST] User data retrieved:', {
      email: userData.email,
      hasName: !!(userData.firstName || userData.lastName)
    });

    // Check if user exists or create new user
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', userData.email)
      .single();

    let isNewUser = false;

    if (!user) {
      console.log('🔵 [Auth OAuth POST] Creating new user for:', userData.email);
      isNewUser = true;
      // Create new user
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          email: userData.email,
          first_name: userData.firstName,
          last_name: userData.lastName,
          picture_url: userData.pictureUrl,
          oauth_platform: provider,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('❌ [Auth OAuth POST] User creation error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to create user account'
        });
      }

      user = newUser;
      console.log('✅ [Auth OAuth POST] New user created:', user.id);
    } else {
      console.log('✅ [Auth OAuth POST] Existing user found:', user.id);
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ [Auth OAuth POST] JWT token generated for user:', user.id);

    // Return JSON response instead of redirecting
    res.json({
      success: true,
      token,
      isNewUser, // Add flag to indicate if this is a newly created user
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        pictureUrl: user.picture_url
      }
    });
  } catch (error) {
    console.error('❌ [Auth OAuth POST] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during OAuth authentication'
    });
  }
});

// Helper functions for OAuth token exchange
async function exchangeGoogleCode(code) {
  try {
    console.log('🟢 [exchangeGoogleCode] Starting token exchange');
    console.log('🟢 redirectUri:', `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`);

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`,
        grant_type: 'authorization_code'
      })
    });

    console.log('🟢 Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', await tokenResponse.text());
      return null;
    }

    const tokens = await tokenResponse.json();

    // Get user info using access token
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });

    if (!userResponse.ok) {
      console.error('User info fetch failed:', await userResponse.text());
      return null;
    }

    const userInfo = await userResponse.json();

    return {
      email: userInfo.email,
      firstName: userInfo.given_name || userInfo.name?.split(' ')[0] || '',
      lastName: userInfo.family_name || userInfo.name?.split(' ').slice(1).join(' ') || '',
      pictureUrl: userInfo.picture
    };
  } catch (error) {
    console.error('Google OAuth error:', error);
    return null;
  }
}

async function exchangeMicrosoftCode(code) {
  // Implementation for Microsoft OAuth token exchange
  return {
    email: 'user@example.com',
    firstName: 'John',
    lastName: 'Doe'
  };
}

async function exchangeAppleCode(code) {
  // Implementation for Apple OAuth token exchange
  return {
    email: 'user@example.com',
    firstName: 'John',
    lastName: 'Doe'
  };
}

export default router;