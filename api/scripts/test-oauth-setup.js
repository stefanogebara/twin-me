#!/usr/bin/env node

/**
 * OAuth Setup Diagnostic Script
 *
 * Run this script to diagnose OAuth configuration issues:
 * node api/scripts/test-oauth-setup.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from root .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '..', '.env');

console.log(`Loading environment from: ${envPath}\n`);
dotenv.config({ path: envPath });

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function logSuccess(message) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logError(message) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

function logInfo(message) {
  console.log(`${colors.cyan}ℹ️  ${message}${colors.reset}`);
}

function logHeader(message) {
  console.log(`\n${colors.blue}${'='.repeat(70)}`);
  console.log(`${message}`);
  console.log(`${'='.repeat(70)}${colors.reset}\n`);
}

// Platform configurations
const platforms = {
  spotify: {
    name: 'Spotify',
    clientId: 'SPOTIFY_CLIENT_ID',
    clientSecret: 'SPOTIFY_CLIENT_SECRET',
    redirectUri: 'SPOTIFY_REDIRECT_URI',
    docs: 'https://developer.spotify.com/dashboard',
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token'
  },
  discord: {
    name: 'Discord',
    clientId: 'DISCORD_CLIENT_ID',
    clientSecret: 'DISCORD_CLIENT_SECRET',
    redirectUri: 'DISCORD_REDIRECT_URI',
    docs: 'https://discord.com/developers/applications',
    authUrl: 'https://discord.com/api/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token'
  },
  github: {
    name: 'GitHub',
    clientId: 'GITHUB_CLIENT_ID',
    clientSecret: 'GITHUB_CLIENT_SECRET',
    redirectUri: 'GITHUB_REDIRECT_URI',
    docs: 'https://github.com/settings/developers',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token'
  },
  google: {
    name: 'Google (YouTube, Gmail, Calendar)',
    clientId: 'GOOGLE_CLIENT_ID',
    clientSecret: 'GOOGLE_CLIENT_SECRET',
    redirectUri: 'GOOGLE_REDIRECT_URI',
    docs: 'https://console.cloud.google.com/apis/credentials',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token'
  }
};

// Test each platform
async function testPlatformConfig(platformKey, config) {
  logHeader(`Testing ${config.name} Configuration`);

  let allValid = true;

  // Check Client ID
  const clientId = process.env[config.clientId];
  if (!clientId || clientId.trim() === '') {
    logError(`${config.clientId} is missing or empty`);
    allValid = false;
  } else {
    logSuccess(`${config.clientId}: ${clientId.substring(0, 12)}...`);
  }

  // Check Client Secret
  const clientSecret = process.env[config.clientSecret];
  if (!clientSecret || clientSecret.trim() === '') {
    logError(`${config.clientSecret} is missing or empty`);
    allValid = false;
  } else {
    logSuccess(`${config.clientSecret}: ${clientSecret.substring(0, 12)}... (${clientSecret.length} chars)`);
  }

  // Check App URL (for redirect URI construction)
  const appUrl = process.env.VITE_APP_URL || process.env.APP_URL;
  if (!appUrl) {
    logWarning('VITE_APP_URL or APP_URL not set - using default http://127.0.0.1:8086');
  } else {
    logInfo(`App URL: ${appUrl}`);
  }

  const redirectUri = `${appUrl || 'http://127.0.0.1:8086'}/oauth/callback`;
  logInfo(`Expected redirect URI: ${redirectUri}`);

  // Provide setup instructions
  if (!allValid) {
    console.log(`\n${colors.yellow}Setup Instructions:${colors.reset}`);
    console.log(`1. Visit: ${config.docs}`);
    console.log(`2. Create/select your OAuth application`);
    console.log(`3. Copy Client ID and Client Secret`);
    console.log(`4. Add them to your .env file:`);
    console.log(`   ${config.clientId}=your-client-id`);
    console.log(`   ${config.clientSecret}=your-client-secret`);
    console.log(`5. Add redirect URI to your app settings:`);
    console.log(`   ${redirectUri}`);
    console.log(`6. Restart your server\n`);
  } else {
    logSuccess('All credentials present!');

    // Test if credentials might work (format check)
    if (platformKey === 'spotify') {
      if (clientId.length !== 32) {
        logWarning(`Spotify Client ID is usually 32 characters (yours is ${clientId.length})`);
      }
      if (clientSecret.length !== 32) {
        logWarning(`Spotify Client Secret is usually 32 characters (yours is ${clientSecret.length})`);
      }
    }
  }

  return allValid;
}

// Test security credentials
function testSecurityCredentials() {
  logHeader('Testing Security Credentials');

  let allValid = true;

  const securityCreds = {
    'ENCRYPTION_KEY': { expectedLength: 64, description: 'AES-256 encryption key (hex)' },
    'JWT_SECRET': { minLength: 32, description: 'JWT signing secret' },
    'TOKEN_ENCRYPTION_KEY': { expectedLength: 64, description: 'OAuth token encryption key (hex)' }
  };

  for (const [key, config] of Object.entries(securityCreds)) {
    const value = process.env[key];

    if (!value || value.trim() === '') {
      logError(`${key} is missing`);
      allValid = false;
    } else {
      const length = value.length;

      if (config.expectedLength && length !== config.expectedLength) {
        logWarning(`${key}: ${length} chars (expected ${config.expectedLength})`);
        logInfo(`   ${config.description}`);
      } else if (config.minLength && length < config.minLength) {
        logWarning(`${key}: ${length} chars (minimum ${config.minLength} recommended)`);
      } else {
        logSuccess(`${key}: ${length} chars`);
      }
    }
  }

  if (!allValid) {
    console.log(`\n${colors.yellow}Generate missing keys:${colors.reset}`);
    console.log(`node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"`);
    console.log(`node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"`);
    console.log(`node -e "console.log('TOKEN_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"\n`);
  }

  return allValid;
}

// Test database configuration
function testDatabaseConfig() {
  logHeader('Testing Database Configuration');

  let allValid = true;

  const dbCreds = {
    'SUPABASE_URL': process.env.SUPABASE_URL,
    'SUPABASE_ANON_KEY': process.env.SUPABASE_ANON_KEY,
    'SUPABASE_SERVICE_ROLE_KEY': process.env.SUPABASE_SERVICE_ROLE_KEY
  };

  for (const [key, value] of Object.entries(dbCreds)) {
    if (!value || value.trim() === '') {
      logError(`${key} is missing`);
      allValid = false;
    } else {
      if (key === 'SUPABASE_URL') {
        logSuccess(`${key}: ${value}`);
      } else {
        logSuccess(`${key}: ${value.substring(0, 20)}... (${value.length} chars)`);
      }
    }
  }

  return allValid;
}

// Test encryption module
async function testEncryption() {
  logHeader('Testing Token Encryption');

  try {
    const { testEncryption } = await import('../services/encryption.js');

    const result = testEncryption();

    if (result) {
      logSuccess('Token encryption/decryption working correctly');
      return true;
    } else {
      logError('Token encryption test failed');
      return false;
    }
  } catch (error) {
    logError(`Encryption test error: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runDiagnostics() {
  console.log(`${colors.cyan}
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║           Twin AI Learn - OAuth Setup Diagnostic Tool            ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  const results = {
    security: false,
    database: false,
    encryption: false,
    platforms: {}
  };

  // Test security credentials
  results.security = testSecurityCredentials();

  // Test database configuration
  results.database = testDatabaseConfig();

  // Test encryption
  results.encryption = await testEncryption();

  // Test each platform
  for (const [key, config] of Object.entries(platforms)) {
    results.platforms[key] = await testPlatformConfig(key, config);
  }

  // Summary
  logHeader('Diagnostic Summary');

  const platformResults = Object.values(results.platforms);
  const validPlatforms = platformResults.filter(Boolean).length;
  const totalPlatforms = platformResults.length;

  if (results.security) {
    logSuccess('Security credentials valid');
  } else {
    logError('Security credentials incomplete');
  }

  if (results.database) {
    logSuccess('Database configuration valid');
  } else {
    logError('Database configuration incomplete');
  }

  if (results.encryption) {
    logSuccess('Encryption module working');
  } else {
    logError('Encryption module has issues');
  }

  console.log(`\nPlatform Credentials: ${validPlatforms}/${totalPlatforms} valid`);

  for (const [key, valid] of Object.entries(results.platforms)) {
    const platform = platforms[key];
    if (valid) {
      logSuccess(`${platform.name}: Ready`);
    } else {
      logError(`${platform.name}: Missing credentials`);
    }
  }

  const allValid = results.security && results.database && results.encryption &&
                    validPlatforms === totalPlatforms;

  if (allValid) {
    console.log(`\n${colors.green}
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   ✅ ALL CHECKS PASSED - OAuth integration is ready to test!     ║
║                                                                   ║
║   Next steps:                                                     ║
║   1. Start servers: npm run dev:full                              ║
║   2. Test OAuth flows: See OAUTH_TESTING_GUIDE.md                ║
║   3. Monitor server logs for detailed feedback                    ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
${colors.reset}`);
  } else {
    console.log(`\n${colors.yellow}
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   ⚠️  SETUP INCOMPLETE - Review errors above                     ║
║                                                                   ║
║   Fix the issues and run this script again:                       ║
║   node api/scripts/test-oauth-setup.js                           ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
${colors.reset}`);
  }
}

// Run diagnostics
runDiagnostics().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
