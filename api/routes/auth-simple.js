import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import supabase from '../config/supabase.js';
import { encryptToken } from '../services/encryption.js';

const router = express.Router();

// JWT secret - in production use environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: hashedPassword,
        first_name: firstName || '',
        last_name: lastName || ''
      })
      .select()
      .single();

    if (insertError) {
      console.error('Database error:', insertError);
      return res.status(500).json({ error: 'Failed to create user' });
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

    // Get user
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (fetchError || !user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
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
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
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

// OAuth routes - Google only
router.get('/oauth/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return res.status(500).json({
      error: 'Google OAuth not configured. Please set GOOGLE_CLIENT_ID in .env file'
    });
  }
  // Use environment variable for redirect URI (use APP_URL for backend, falls back to VITE_APP_URL for local dev)
  const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086';
  const redirectUri = encodeURIComponent(`${appUrl}/oauth/callback`);
  // Only request basic profile scopes for authentication
  const scope = encodeURIComponent('email profile openid');
  const state = Buffer.from(JSON.stringify({
    provider: 'google',
    isAuth: true, // Mark this as authentication flow
    timestamp: Date.now()
  })).toString('base64');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&access_type=offline&prompt=consent&state=${state}`;

  res.redirect(authUrl);
});

// Helper function to exchange Google auth code for tokens
async function exchangeGoogleCode(code) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086';
    const redirectUri = `${appUrl}/oauth/callback`;

    // Exchange code for tokens
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

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', await tokenResponse.text());
      return null;
    }

    const tokens = await tokenResponse.json();

    // Get user info
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });

    if (!userResponse.ok) {
      console.error('Failed to get user info:', await userResponse.text());
      return null;
    }

    const userData = await userResponse.json();

    return {
      email: userData.email,
      firstName: userData.given_name || '',
      lastName: userData.family_name || '',
      picture: userData.picture,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token
    };
  } catch (error) {
    console.error('Google OAuth error:', error);
    return null;
  }
}

// OAuth callback handler (GET for redirects)
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:8086';

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
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      console.log('🔍 Auth GET callback - decoded state:', stateData);
      provider = stateData.provider || 'google';
      userId = stateData.userId;
      isConnectorFlow = !!userId; // If userId exists, this is a connector OAuth flow
      console.log('🔍 Auth GET callback - flow detection:', { provider, userId, isConnectorFlow });
    } catch (e) {
      console.log('Could not decode state, defaulting to google');
    }

    let userData = null;

    // Check if this is a Google-based OAuth (auth or connector)
    const isGoogleBased = provider === 'google' || provider.startsWith('google_');

    // Check if this is an authentication flow
    const isAuthFlow = stateData && stateData.isAuth === true;

    if (isGoogleBased && code && (isAuthFlow || !isConnectorFlow)) {
      // Real Google OAuth for authentication
      userData = await exchangeGoogleCode(code);

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
        const tokens = await exchangeGoogleCode(code);
        if (tokens) {
          // Store the connection with encrypted tokens in database
          const connectionData = {
            user_id: userId,
            provider: provider,
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

          const { error: dbError } = await supabase
            .from('data_connectors')
            .upsert(connectionData, {
              onConflict: 'user_id,provider'
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
      // Only create mock users for authentication flows
      if (!userData) {
        console.log('Using mock user for development (auth flow)');
        userData = {
          email: provider === 'google' ? 'demo@google.com' : `demo@${provider}.com`,
          firstName: provider.charAt(0).toUpperCase() + provider.slice(1),
          lastName: 'User'
        };
      }
    }

    // Check if user exists or create new
    let { data: user, error: userFetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', userData.email)
      .single();

    if (!user) {
      // Create new user with encrypted tokens
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          email: userData.email,
          first_name: userData.firstName,
          last_name: userData.lastName,
          oauth_provider: provider,
          picture_url: userData.picture
        })
        .select()
        .single();

      if (insertError) {
        console.error('Failed to create user:', insertError);
        throw new Error('User creation failed');
      }

      user = newUser;
    }

    // Handle redirect for connector OAuth flow
    if (isConnectorFlow && userId) {
      console.log('🔗 Processing connector OAuth in backend GET route');
      // Redirect back to get-started page with connected=true
      const redirectUrl = `http://localhost:8086/get-started?connected=true&provider=${provider}`;
      return res.redirect(redirectUrl);
    }

    // Generate JWT token for regular user authentication
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Redirect to frontend with token
    const redirectUrl = `${appUrl}/oauth/callback?token=${token}&provider=${provider}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${appUrl}/auth?error=callback_failed`);
  }
});

// OAuth callback handler (POST for API calls)
router.post('/oauth/callback', async (req, res) => {
  try {
    const { code, state, provider } = req.body;

    // Decode state to check if this is a connector OAuth
    let stateData = null;
    let isConnectorFlow = false;
    try {
      if (state) {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        isConnectorFlow = !!stateData.userId;
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
      userData = await exchangeGoogleCode(code);

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
        const tokens = await exchangeGoogleCode(code);
        if (tokens) {
          // Store the connection with encrypted tokens in database
          const connectionData = {
            user_id: stateData.userId,
            provider: provider,
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

          const { error: dbError } = await supabase
            .from('data_connectors')
            .upsert(connectionData, {
              onConflict: 'user_id,provider'
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
      // Only create mock users for authentication flows
      if (!userData) {
        console.log('Using mock user for development (auth flow)');
        userData = {
          email: provider === 'google' ? 'demo@google.com' : `demo@${provider}.com`,
          firstName: provider.charAt(0).toUpperCase() + provider.slice(1),
          lastName: 'User'
        };
      }
    }

    // Check if user exists or create new (only for auth flows, not connector flows)
    let user = null;

    if (!isConnectorFlow && userData) {
      const { data: existingUser, error: userFetchError } = await supabase
        .from('users')
        .select('*')
        .eq('email', userData.email)
        .single();

      if (!existingUser) {
        // Create new user
        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert({
            email: userData.email,
            first_name: userData.firstName,
            last_name: userData.lastName,
            oauth_provider: provider,
            picture_url: userData.picture
          })
          .select()
          .single();

        if (insertError) {
          console.error('Failed to create user:', insertError);
          throw new Error('User creation failed');
        }

        user = newUser;
      } else {
        user = existingUser;
      }
    }

    // Handle response based on flow type
    if (isConnectorFlow) {
      // For connector flows, just return success
      res.json({
        success: true,
        message: 'Connector authenticated successfully',
        provider: provider
      });
    } else if (user) {
      // Generate JWT token for auth flows
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
          fullName: `${user.first_name} ${user.last_name}`.trim()
        }
      });
    } else {
      throw new Error('Authentication failed');
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'OAuth authentication failed' });
  }
});

export default router;