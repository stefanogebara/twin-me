/**
 * OAuth Credentials Validation Middleware
 * Validates that required OAuth credentials are present and properly formatted
 * Runs on server startup to catch configuration issues early
 */

/**
 * Validate OAuth credentials for all configured platforms
 * @returns {Object} Validation results with warnings and errors
 */
export function validateOAuthCredentials() {
  const results = {
    valid: [],
    warnings: [],
    errors: [],
    missing: []
  };

  // Platform configurations with required credentials
  const platformCredentials = {
    spotify: {
      required: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'],
      optional: [],
      name: 'Spotify'
    },
    discord: {
      required: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'],
      optional: [],
      name: 'Discord'
    },
    github: {
      required: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
      optional: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
      name: 'GitHub'
    },
    google: {
      required: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      optional: [],
      name: 'Google (YouTube, Gmail, Calendar)'
    },
    slack: {
      required: ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET'],
      optional: [],
      name: 'Slack'
    },
    linkedin: {
      required: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
      optional: [],
      name: 'LinkedIn'
    },
    reddit: {
      required: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'],
      optional: [],
      name: 'Reddit'
    }
  };

  console.log('\n🔐 Validating OAuth Credentials...\n');

  for (const [platform, config] of Object.entries(platformCredentials)) {
    const missingRequired = [];
    const missingOptional = [];
    const presentCredentials = [];

    // Check required credentials
    for (const credential of config.required) {
      if (!process.env[credential] || process.env[credential].trim() === '') {
        missingRequired.push(credential);
      } else {
        presentCredentials.push(credential);
      }
    }

    // Check optional credentials
    for (const credential of config.optional) {
      if (!process.env[credential] || process.env[credential].trim() === '') {
        missingOptional.push(credential);
      } else {
        presentCredentials.push(credential);
      }
    }

    if (missingRequired.length > 0) {
      results.missing.push({
        platform: config.name,
        credentials: missingRequired
      });
      console.log(`❌ ${config.name}: Missing required credentials`);
      missingRequired.forEach(cred => console.log(`   - ${cred}`));
    } else {
      results.valid.push(config.name);
      console.log(`✅ ${config.name}: All required credentials present`);

      if (missingOptional.length > 0) {
        results.warnings.push({
          platform: config.name,
          credentials: missingOptional
        });
        console.log(`   ⚠️  Optional credentials missing: ${missingOptional.join(', ')}`);
      }
    }
  }

  // Check core security credentials
  console.log('\n🔒 Validating Security Credentials...\n');

  const securityCredentials = [
    'ENCRYPTION_KEY',
    'JWT_SECRET',
    'TOKEN_ENCRYPTION_KEY'
  ];

  for (const credential of securityCredentials) {
    if (!process.env[credential] || process.env[credential].trim() === '') {
      results.errors.push(`Missing ${credential}`);
      console.log(`❌ ${credential}: Missing or empty`);
    } else {
      console.log(`✅ ${credential}: Present`);
    }
  }

  // Check redirect URI configuration
  console.log('\n🌐 Validating Redirect URI Configuration...\n');

  const appUrl = process.env.VITE_APP_URL || process.env.APP_URL;
  if (!appUrl) {
    results.warnings.push({
      platform: 'General',
      credentials: ['VITE_APP_URL or APP_URL not set - using default http://localhost:8086']
    });
    console.log('⚠️  VITE_APP_URL or APP_URL not set - using default http://localhost:8086');
  } else {
    console.log(`✅ App URL: ${appUrl}`);
    console.log(`   OAuth callbacks will use: ${appUrl}/oauth/callback`);
  }

  // Summary
  console.log('\n📊 Validation Summary:\n');
  console.log(`✅ Valid platforms: ${results.valid.length}`);
  console.log(`⚠️  Warnings: ${results.warnings.length}`);
  console.log(`❌ Missing credentials: ${results.missing.length}`);
  console.log(`❌ Errors: ${results.errors.length}\n`);

  if (results.missing.length > 0) {
    console.log('💡 To fix missing credentials:');
    console.log('   1. Visit the platform\'s developer console');
    console.log('   2. Create an OAuth application');
    console.log('   3. Add credentials to your .env file');
    console.log('   4. Restart the server\n');
  }

  return results;
}

/**
 * Express middleware to validate credentials before starting server
 */
export function oauthCredentialsMiddleware(req, res, next) {
  // This runs once during server initialization
  if (!global.oauthCredentialsValidated) {
    const results = validateOAuthCredentials();
    global.oauthCredentialsValidated = true;

    // Store results for runtime access
    global.oauthCredentialsStatus = results;
  }

  next();
}

/**
 * Get the current OAuth credentials validation status
 */
export function getOAuthCredentialsStatus() {
  return global.oauthCredentialsStatus || {
    valid: [],
    warnings: [],
    errors: [],
    missing: []
  };
}

export default {
  validateOAuthCredentials,
  oauthCredentialsMiddleware,
  getOAuthCredentialsStatus
};
