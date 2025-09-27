import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const router = express.Router();

// JWT secret - in production use environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// In-memory user storage (for testing - replace with database in production)
const users = new Map();

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

// OAuth routes
router.get('/oauth/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '851806289280-k0v833noqjk02r43m45cjr7prnhg24gr.apps.googleusercontent.com';
  const redirectUri = encodeURIComponent(`${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback`);
  const scope = encodeURIComponent('email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly');
  const state = Buffer.from(JSON.stringify({
    provider: 'google',
    timestamp: Date.now()
  })).toString('base64');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&access_type=offline&prompt=consent&state=${state}`;

  res.redirect(authUrl);
});

router.get('/oauth/microsoft', (req, res) => {
  // For now, create a mock user and redirect with success
  const mockUser = {
    id: `ms_user_${Date.now()}`,
    email: 'demo@microsoft.com',
    first_name: 'Microsoft',
    last_name: 'User'
  };

  users.set(mockUser.email, mockUser);

  const token = jwt.sign(
    { id: mockUser.id, email: mockUser.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  // Redirect to frontend with token
  const redirectUrl = `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback?token=${token}&provider=microsoft`;
  res.redirect(redirectUrl);
});

router.get('/oauth/apple', (req, res) => {
  // For now, create a mock user and redirect with success
  const mockUser = {
    id: `apple_user_${Date.now()}`,
    email: 'demo@apple.com',
    first_name: 'Apple',
    last_name: 'User'
  };

  users.set(mockUser.email, mockUser);

  const token = jwt.sign(
    { id: mockUser.id, email: mockUser.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  // Redirect to frontend with token
  const redirectUrl = `${process.env.VITE_APP_URL || 'http://localhost:8086'}/oauth/callback?token=${token}&provider=apple`;
  res.redirect(redirectUrl);
});

// OAuth callback handler
router.post('/oauth/callback', async (req, res) => {
  try {
    const { code, state, provider } = req.body;

    // For demo purposes, create a mock user
    const mockUser = {
      id: `${provider}_user_${Date.now()}`,
      email: `demo@${provider}.com`,
      first_name: provider.charAt(0).toUpperCase() + provider.slice(1),
      last_name: 'User'
    };

    users.set(mockUser.email, mockUser);

    // Generate JWT token
    const token = jwt.sign(
      { id: mockUser.id, email: mockUser.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: mockUser.id,
        email: mockUser.email,
        firstName: mockUser.first_name,
        lastName: mockUser.last_name,
        fullName: `${mockUser.first_name} ${mockUser.last_name}`.trim()
      }
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'OAuth authentication failed' });
  }
});

export default router;