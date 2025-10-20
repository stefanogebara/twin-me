#!/usr/bin/env node

/**
 * Platform Integration Scaffold Script
 *
 * Generates boilerplate code for integrating a new OAuth platform.
 *
 * Usage: node scaffold-platform.js <platform-name>
 * Example: node scaffold-platform.js spotify
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const platformName = process.argv[2];

if (!platformName) {
  console.error('❌ Error: Platform name required');
  console.log('Usage: node scaffold-platform.js <platform-name>');
  console.log('Example: node scaffold-platform.js spotify');
  process.exit(1);
}

const platformNameUpper = platformName.toUpperCase();
const platformNameCapitalized = platformName.charAt(0).toUpperCase() + platformName.slice(1);

console.log(`\n🚀 Scaffolding ${platformNameCapitalized} integration...\n`);

// 1. Environment variables template
const envTemplate = `
# ${platformNameCapitalized} OAuth
${platformNameUpper}_CLIENT_ID=your-${platformName}-client-id
${platformNameUpper}_CLIENT_SECRET=your-${platformName}-client-secret
`;

console.log('📝 Environment Variables to Add (.env):');
console.log(envTemplate);

// 2. Platform config template
const platformConfig = `
  ${platformName}: {
    name: '${platformNameCapitalized}',
    authUrl: 'https://${platformName}.com/oauth/authorize',
    tokenUrl: 'https://${platformName}.com/oauth/token',
    scopes: ['scope1', 'scope2'], // TODO: Update with actual scopes
    apiBaseUrl: 'https://api.${platformName}.com/v1',

    endpoints: {
      userProfile: '/me',
      // TODO: Add platform-specific endpoints
    },

    tokenType: 'Bearer',
    refreshable: true,

    rateLimit: {
      requests: 100,
      window: 3600, // TODO: Update with actual rate limit
    },
  },
`;

const configFilePath = join(process.cwd(), 'api', 'services', 'platformAPIMappings.js');
console.log(`\n📦 Platform Config to Add (${configFilePath}):`);
console.log(platformConfig);

// 3. OAuth route template
const oauthRoute = `
// ${platformNameCapitalized} OAuth routes
router.get('/connect/${platformName}', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const config = PLATFORM_CONFIGS['${platformName}'];

    const state = crypto.randomBytes(16).toString('hex');
    await redis.set(\`oauth:state:\${state}\`, JSON.stringify({ userId, platform: '${platformName}', expiresAt: Date.now() + 600000 }), 'EX', 600);

    const authUrl = new URL(config.authUrl);
    authUrl.searchParams.append('client_id', process.env.${platformNameUpper}_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', \`\${process.env.CLIENT_URL}/oauth/callback\`);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', config.scopes.join(' '));
    authUrl.searchParams.append('state', state);

    res.json({ authUrl: authUrl.toString() });
  } catch (error) {
    console.error('${platformNameCapitalized} OAuth initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate ${platformNameCapitalized} OAuth' });
  }
});

router.get('/callback/${platformName}', async (req, res) => {
  const { code, state } = req.query;

  try {
    const stored = await redis.get(\`oauth:state:\${state}\`);
    if (!stored) throw new Error('Invalid OAuth state');

    const { userId } = JSON.parse(stored);
    await redis.del(\`oauth:state:\${state}\`);

    const tokens = await exchangeCodeForTokens('${platformName}', code);

    await savePlatformConnection(userId, '${platformName}', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in * 1000),
    });

    res.redirect(\`\${process.env.CLIENT_URL}/get-started?connected=${platformName}\`);
  } catch (error) {
    console.error('${platformNameCapitalized} OAuth callback error:', error);
    res.redirect(\`\${process.env.CLIENT_URL}/get-started?error=${platformName}\`);
  }
});
`;

const routeFilePath = join(process.cwd(), 'api', 'routes', 'entertainment-connectors.js');
console.log(`\n🔀 OAuth Routes to Add (${routeFilePath}):`);
console.log(oauthRoute);

// 4. Extraction service template
const extractionService = `
async function extract${platformNameCapitalized}Data(userId) {
  const connection = await getPlatformConnection(userId, '${platformName}');
  if (!connection || !connection.accessToken) {
    throw new Error('${platformNameCapitalized} not connected');
  }

  try {
    const accessToken = decryptToken(connection.accessToken);
    const config = PLATFORM_CONFIGS['${platformName}'];

    // TODO: Implement platform-specific data extraction
    const response = await axios.get(
      \`\${config.apiBaseUrl}\${config.endpoints.userProfile}\`,
      {
        headers: {
          'Authorization': \`\${config.tokenType} \${accessToken}\`,
        },
      }
    );

    // TODO: Transform platform data to soul signature format
    const extractedData = transform${platformNameCapitalized}Data(response.data);

    await saveSoulData(userId, {
      platform: '${platformName}',
      dataType: 'user_profile',
      rawData: response.data,
      extractedPatterns: extractedData,
      extractedAt: new Date(),
    });

    return {
      success: true,
      itemsExtracted: extractedData.length,
      platform: '${platformName}',
    };
  } catch (error) {
    if (error.response?.status === 401) {
      await markConnectionRequiresReauth(userId, '${platformName}');
      return {
        success: false,
        requiresReauth: true,
      };
    }
    throw error;
  }
}

function transform${platformNameCapitalized}Data(rawData) {
  // TODO: Implement transformation logic
  return [];
}
`;

const extractionFilePath = join(process.cwd(), 'api', 'services', 'dataExtraction.js');
console.log(`\n🔧 Extraction Service to Add (${extractionFilePath}):`);
console.log(extractionService);

// 5. Frontend platform card template
const frontendCard = `
  {
    id: '${platformName}',
    name: '${platformNameCapitalized}',
    icon: '${platformNameCapitalized}Icon', // TODO: Import from lucide-react
    description: 'TODO: What this reveals about your soul signature',
    setupTime: '10 seconds setup',
    category: 'optional', // TODO: Change to 'essential' if appropriate
    insights: [
      'TODO: Insight Type 1',
      'TODO: Insight Type 2',
      '+1 more',
    ],
    color: '#000000', // TODO: Update with brand color
  },
`;

const frontendFilePath = join(process.cwd(), 'src', 'pages', 'GetStarted.tsx');
console.log(`\n🎨 Platform Card to Add (${frontendFilePath}):`);
console.log(frontendCard);

// 6. Test template
const testTemplate = `
describe('${platformNameCapitalized} Integration', () => {
  describe('OAuth Flow', () => {
    it('should initiate OAuth with correct parameters', async () => {
      // TODO: Implement test
    });

    it('should handle OAuth callback successfully', async () => {
      // TODO: Implement test
    });

    it('should handle invalid OAuth state', async () => {
      // TODO: Implement test
    });
  });

  describe('Data Extraction', () => {
    it('should extract user data successfully', async () => {
      // TODO: Implement test
    });

    it('should handle expired tokens', async () => {
      // TODO: Implement test
    });

    it('should handle rate limiting', async () => {
      // TODO: Implement test
    });
  });
});
`;

const testFilePath = join(process.cwd(), 'tests', `${platformName}.test.js`);
console.log(`\n🧪 Test Suite Template (${testFilePath}):`);
console.log(testTemplate);

// Summary
console.log('\n✅ Scaffold Complete!\n');
console.log('📋 Next Steps:');
console.log(`1. Add environment variables to .env`);
console.log(`2. Update PLATFORM_CONFIGS in platformAPIMappings.js`);
console.log(`3. Add OAuth routes to entertainment-connectors.js`);
console.log(`4. Implement extraction service in dataExtraction.js`);
console.log(`5. Add platform card to GetStarted.tsx`);
console.log(`6. Implement tests`);
console.log(`7. Test OAuth flow end-to-end\n`);

console.log('📚 For detailed guidance, see:');
console.log('   skills/oauth-platform-integration/SKILL.md\n');
