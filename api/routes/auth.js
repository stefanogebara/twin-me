const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { supabase } = require('../config/supabase');

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
  try {
    const { email, password } = req.body;

    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
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
  const clientId = process.env.GOOGLE_CLIENT_ID || 'your-google-client-id';
  const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL}/oauth/callback`);
  const scope = encodeURIComponent('email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly');
  const state = Buffer.from(JSON.stringify({
    provider: 'google',
    timestamp: Date.now()
  })).toString('base64');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&access_type=offline&prompt=consent&state=${state}`;

  res.redirect(authUrl);
});

router.get('/oauth/microsoft', (req, res) => {
  const clientId = process.env.MICROSOFT_CLIENT_ID || 'your-microsoft-client-id';
  const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL}/oauth/callback`);
  const scope = encodeURIComponent('openid profile email User.Read Mail.Read Calendars.Read');
  const state = Buffer.from(JSON.stringify({
    provider: 'microsoft',
    timestamp: Date.now()
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
    timestamp: Date.now()
  })).toString('base64');

  const authUrl = `https://appleid.apple.com/auth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&response_mode=form_post&state=${state}`;

  res.redirect(authUrl);
});

// OAuth callback handler
router.post('/oauth/callback', async (req, res) => {
  try {
    const { code, state, provider } = req.body;

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
      return res.status(400).json({ error: 'OAuth authentication failed' });
    }

    // Check if user exists or create new user
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', userData.email)
      .single();

    if (!user) {
      // Create new user
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          email: userData.email,
          first_name: userData.firstName,
          last_name: userData.lastName,
          oauth_provider: provider,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('OAuth user creation error:', error);
        return res.status(400).json({ error: 'Failed to create user' });
      }

      user = newUser;
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
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'OAuth authentication failed' });
  }
});

// Helper functions for OAuth token exchange
async function exchangeGoogleCode(code) {
  // Implementation for Google OAuth token exchange
  // This would normally call Google's OAuth API to exchange the code for user data
  return {
    email: 'user@example.com',
    firstName: 'John',
    lastName: 'Doe'
  };
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

module.exports = router;