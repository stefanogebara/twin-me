import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const router = express.Router();

// JWT secret - in production use environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// In-memory user storage (for testing - replace with database in production)
const users = new Map();

// In-memory connector storage (for testing - replace with database in production)
const tempConnections = new Map();

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Check if user exists
    if (users.has(email)) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userId = `user_${Date.now()}`;
    const newUser = {
      id: userId,
      email,
      password_hash: hashedPassword,
      first_name: firstName || '',
      last_name: lastName || '',
      created_at: new Date().toISOString()
    };

    users.set(email, newUser);

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
    const user = users.get(email);

    if (!user) {
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
    const user = Array.from(users.values()).find(u => u.id === decoded.id);

    if (!user) {
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
  const clientId = process.env.GOOGLE_CLIENT_ID || '851806289280-k0v833noqjk02r43m45cjr7prnhg24gr.apps.googleusercontent.com';
  // Try multiple possible redirect URIs that might be configured in Google Cloud Console
  const possibleRedirectUris = [
    'http://localhost:8084/api/auth/oauth/callback',
    'http://localhost:3001/api/auth/oauth/callback',
    'http://localhost:8086/oauth/callback',
    'http://localhost:8084/oauth/callback'
  ];

  // Use the most likely one - frontend port with oauth callback
  const redirectUri = encodeURIComponent('http://localhost:8086/oauth/callback');
  const scope = encodeURIComponent('email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly');
  const state = Buffer.from(JSON.stringify({
    provider: 'google',
    timestamp: Date.now()
  })).toString('base64');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&access_type=offline&prompt=consent&state=${state}`;

  res.redirect(authUrl);
});

// Helper function to exchange Google auth code for tokens
async function exchangeGoogleCode(code) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID || '851806289280-k0v833noqjk02r43m45cjr7prnhg24gr.apps.googleusercontent.com';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || 'GOCSPX-your-client-secret'; // Add to .env
    const redirectUri = `http://localhost:8086/oauth/callback`;

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

    if (error) {
      console.error('OAuth error:', error);
      return res.redirect(`${process.env.VITE_APP_URL || 'http://localhost:8086'}/auth?error=${error}`);
    }

    if (!code) {
      console.error('No authorization code received');
      return res.redirect(`${process.env.VITE_APP_URL || 'http://localhost:8086'}/auth?error=no_code`);
    }

    // Decode state to get provider and userId
    let provider = 'google';
    let userId = null;
    let isConnectorFlow = false;
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      provider = stateData.provider || 'google';
      userId = stateData.userId;
      isConnectorFlow = !!userId; // If userId exists, this is a connector OAuth flow
    } catch (e) {
      console.log('Could not decode state, defaulting to google');
    }

    let userData = null;

    if (provider === 'google' && code) {
      // Real Google OAuth
      userData = await exchangeGoogleCode(code);
    }

    // For connector OAuth, we don't need real user data - just store the connection
    if (isConnectorFlow) {
      console.log('Processing connector OAuth flow for:', provider);
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
    let user = Array.from(users.values()).find(u => u.email === userData.email);

    if (!user) {
      const userId = `${provider}_user_${Date.now()}`;
      user = {
        id: userId,
        email: userData.email,
        first_name: userData.firstName,
        last_name: userData.lastName,
        oauth_provider: provider,
        access_token: userData.accessToken,
        refresh_token: userData.refreshToken,
        created_at: new Date().toISOString()
      };
      users.set(userData.email, user);
    } else {
      // Update tokens if they exist
      if (userData.accessToken) {
        user.access_token = userData.accessToken;
        user.refresh_token = userData.refreshToken;
      }
    }

    // Handle connector storage if this is a connector OAuth flow
    if (isConnectorFlow && userId) {
      try {
        console.log(`🔗 Storing connector for ${provider} and user ${userId}`);

        // Store the connector data (similar to connectors.js logic)
        const connectionKey = `${userId}-${provider}`;
        const connectionData = {
          user_id: userId,
          provider: provider,
          access_token: userData.accessToken || 'mock_token_' + Date.now(), // Mock token for testing
          refresh_token: userData.refreshToken || null,
          expires_at: null,
          connected_at: new Date(),
          last_sync: new Date(),
          is_active: true,
          permissions: {},
          total_synced: 0,
          last_sync_status: 'success',
          error_count: 0
        };

        tempConnections.set(connectionKey, connectionData);
        console.log(`✅ Successfully stored ${provider} connection for user ${userId}`);
        console.log(`📊 Current connections:`, Array.from(tempConnections.keys()));

        // Redirect back to get-started page with connected=true
        const redirectUrl = `http://localhost:8086/get-started?connected=true`;
        return res.redirect(redirectUrl);
      } catch (error) {
        console.error('Error storing connector:', error);
      }
    }

    // Generate JWT token for regular user authentication
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Redirect to frontend with token
    const redirectUrl = `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback?token=${token}&provider=${provider}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env.VITE_APP_URL || 'http://localhost:8086'}/auth?error=callback_failed`);
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

    if (provider === 'google' && code) {
      // Real Google OAuth
      userData = await exchangeGoogleCode(code);
    }

    // For connector OAuth, we don't need real user data - just store the connection
    if (isConnectorFlow) {
      console.log('Processing connector OAuth flow for:', provider);
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
      user = Array.from(users.values()).find(u => u.email === userData.email);

      if (!user) {
        const userId = `${provider}_user_${Date.now()}`;
        user = {
          id: userId,
          email: userData.email,
          first_name: userData.firstName,
          last_name: userData.lastName,
          oauth_provider: provider,
          access_token: userData.accessToken,
          refresh_token: userData.refreshToken,
          created_at: new Date().toISOString()
        };
        users.set(userData.email, user);
      } else {
        // Update tokens if they exist
        if (userData.accessToken) {
          user.access_token = userData.accessToken;
          user.refresh_token = userData.refreshToken;
        }
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