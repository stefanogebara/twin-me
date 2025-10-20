# OAuth Configuration Examples

## Complete Platform Configurations

### Spotify

```javascript
spotify: {
  name: 'Spotify',
  authUrl: 'https://accounts.spotify.com/authorize',
  tokenUrl: 'https://accounts.spotify.com/api/token',
  scopes: [
    'user-read-recently-played',
    'user-top-read',
    'user-library-read',
    'user-read-playback-state',
  ],
  apiBaseUrl: 'https://api.spotify.com/v1',

  endpoints: {
    userProfile: '/me',
    recentTracks: '/me/player/recently-played',
    topTracks: '/me/top/tracks',
    topArtists: '/me/top/artists',
    savedTracks: '/me/tracks',
  },

  tokenType: 'Bearer',
  refreshable: true,

  rateLimit: {
    requests: 180,
    window: 60, // per minute
  },
},
```

### Discord

```javascript
discord: {
  name: 'Discord',
  authUrl: 'https://discord.com/api/oauth2/authorize',
  tokenUrl: 'https://discord.com/api/oauth2/token',
  scopes: ['identify', 'guilds', 'messages.read'],
  apiBaseUrl: 'https://discord.com/api/v10',

  endpoints: {
    userProfile: '/users/@me',
    guilds: '/users/@me/guilds',
    connections: '/users/@me/connections',
  },

  tokenType: 'Bearer',
  refreshable: true,

  rateLimit: {
    requests: 50,
    window: 1, // per second (global)
  },
},
```

### GitHub

```javascript
github: {
  name: 'GitHub',
  authUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  scopes: ['user', 'repo:read'],
  apiBaseUrl: 'https://api.github.com',

  endpoints: {
    userProfile: '/user',
    repos: '/user/repos',
    events: '/users/{username}/events',
    commits: '/repos/{owner}/{repo}/commits',
  },

  tokenType: 'token', // GitHub uses 'token' instead of 'Bearer'
  refreshable: false, // GitHub tokens don't expire

  rateLimit: {
    requests: 5000,
    window: 3600, // per hour
  },
},
```

### LinkedIn

```javascript
linkedin: {
  name: 'LinkedIn',
  authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
  tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
  scopes: ['r_liteprofile', 'r_emailaddress', 'w_member_social'],
  apiBaseUrl: 'https://api.linkedin.com/v2',

  endpoints: {
    userProfile: '/me',
    email: '/emailAddress?q=members&projection=(elements*(handle~))',
    posts: '/ugcPosts',
  },

  tokenType: 'Bearer',
  refreshable: true,

  rateLimit: {
    requests: 100,
    window: 86400, // per day
  },
},
```

### YouTube

```javascript
youtube: {
  name: 'YouTube',
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scopes: [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
  apiBaseUrl: 'https://www.googleapis.com/youtube/v3',

  endpoints: {
    channels: '/channels',
    subscriptions: '/subscriptions',
    playlistItems: '/playlistItems',
    videos: '/videos',
  },

  tokenType: 'Bearer',
  refreshable: true,

  rateLimit: {
    requests: 10000,
    window: 86400, // per day (quota units)
  },
},
```

## OAuth State Management

### Generate Secure State

```javascript
const crypto = require('crypto');

function generateOAuthState(userId, platform) {
  const state = crypto.randomBytes(16).toString('hex');
  const expiry = Date.now() + (10 * 60 * 1000); // 10 minutes

  // Store in database or session
  return {
    state,
    userId,
    platform,
    expiresAt: expiry,
  };
}
```

### Verify State on Callback

```javascript
async function verifyOAuthState(stateToken) {
  const stored = await redis.get(`oauth:state:${stateToken}`);
  if (!stored) {
    throw new Error('Invalid or expired OAuth state');
  }

  const state = JSON.parse(stored);
  if (state.expiresAt < Date.now()) {
    throw new Error('OAuth state expired');
  }

  // Delete used state (prevent replay attacks)
  await redis.del(`oauth:state:${stateToken}`);

  return state;
}
```

## Token Exchange Implementation

### Basic Token Exchange

```javascript
async function exchangeCodeForTokens(platform, code) {
  const config = PLATFORM_CONFIGS[platform];

  const tokenResponse = await axios.post(
    config.tokenUrl,
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.CLIENT_URL}/oauth/callback`,
      client_id: process.env[`${platform.toUpperCase()}_CLIENT_ID`],
      client_secret: process.env[`${platform.toUpperCase()}_CLIENT_SECRET`],
    },
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
    }
  );

  return tokenResponse.data;
}
```

### Token Refresh (for platforms that support it)

```javascript
async function refreshAccessToken(platform, refreshToken) {
  const config = PLATFORM_CONFIGS[platform];

  if (!config.refreshable) {
    throw new Error(`Platform ${platform} does not support token refresh`);
  }

  const tokenResponse = await axios.post(
    config.tokenUrl,
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env[`${platform.toUpperCase()}_CLIENT_ID`],
      client_secret: process.env[`${platform.toUpperCase()}_CLIENT_SECRET`],
    },
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
    }
  );

  return tokenResponse.data;
}
```

## Token Encryption

### Encrypt Before Storing

```javascript
const crypto = require('crypto');

function encryptToken(token) {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}
```

### Decrypt When Retrieving

```javascript
function decryptToken(encryptedData) {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

  const decipher = crypto.createDecipheriv(
    algorithm,
    key,
    Buffer.from(encryptedData.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

## Error Handling

### Common OAuth Errors

```javascript
function handleOAuthError(error, platform) {
  // User denied authorization
  if (error.error === 'access_denied') {
    return {
      userFriendly: 'Authorization cancelled. You can try connecting again.',
      log: `User denied ${platform} authorization`,
      action: 'CANCELLED',
    };
  }

  // Invalid OAuth state (CSRF attack or expired)
  if (error.message.includes('Invalid OAuth state')) {
    return {
      userFriendly: 'Security verification failed. Please try again.',
      log: `Invalid OAuth state for ${platform}`,
      action: 'RETRY',
    };
  }

  // Token exchange failed
  if (error.response?.status === 400) {
    return {
      userFriendly: 'Connection failed. Please check your internet and try again.',
      log: `Token exchange failed for ${platform}: ${error.response.data}`,
      action: 'RETRY',
    };
  }

  // Rate limit exceeded
  if (error.response?.status === 429) {
    return {
      userFriendly: 'Too many requests. Please wait a moment and try again.',
      log: `Rate limit exceeded for ${platform}`,
      action: 'WAIT',
    };
  }

  // Generic error
  return {
    userFriendly: 'An unexpected error occurred. Please contact support.',
    log: `Unexpected OAuth error for ${platform}: ${error.message}`,
    action: 'SUPPORT',
  };
}
```

## PKCE Flow (Enhanced Security)

Some platforms require PKCE (Proof Key for Code Exchange) for added security:

### Generate Code Verifier & Challenge

```javascript
function generatePKCEPair() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');

  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return {
    codeVerifier,
    codeChallenge,
  };
}
```

### Use in Authorization URL

```javascript
const pkce = generatePKCEPair();

// Store code_verifier for token exchange
await storeCodeVerifier(userId, platform, pkce.codeVerifier);

// Include in authorization URL
authUrl.searchParams.append('code_challenge', pkce.codeChallenge);
authUrl.searchParams.append('code_challenge_method', 'S256');
```

### Use in Token Exchange

```javascript
const codeVerifier = await getCodeVerifier(userId, platform);

const tokenResponse = await axios.post(config.tokenUrl, {
  grant_type: 'authorization_code',
  code,
  redirect_uri: callbackUrl,
  client_id: clientId,
  code_verifier: codeVerifier, // Include PKCE verifier
});
```
