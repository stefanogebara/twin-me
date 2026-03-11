/**
 * OAuth Credentials Validation Middleware
 * Validates that required OAuth credentials are present and properly formatted
 * Runs on server startup to catch configuration issues early
 */

import { createLogger } from '../services/logger.js';

const log = createLogger('OAuthValidation');

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

  log.info('Validating OAuth credentials');

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
      log.warn('Missing required credentials', { platform: config.name, missing: missingRequired });
    } else {
      results.valid.push(config.name);
      log.info('All required credentials present', { platform: config.name });

      if (missingOptional.length > 0) {
        results.warnings.push({
          platform: config.name,
          credentials: missingOptional
        });
        log.warn('Optional credentials missing', { platform: config.name, missing: missingOptional });
      }
    }
  }

  // Check core security credentials
  log.info('Validating security credentials');

  const securityCredentials = [
    'ENCRYPTION_KEY',
    'JWT_SECRET',
    'TOKEN_ENCRYPTION_KEY'
  ];

  for (const credential of securityCredentials) {
    if (!process.env[credential] || process.env[credential].trim() === '') {
      results.errors.push(`Missing ${credential}`);
      log.error('Security credential missing or empty', { credential });
    } else {
      log.info('Security credential present', { credential });
    }
  }

  // Check redirect URI configuration
  log.info('Validating redirect URI configuration');

  const appUrl = process.env.VITE_APP_URL || process.env.APP_URL;
  if (!appUrl) {
    results.warnings.push({
      platform: 'General',
      credentials: ['VITE_APP_URL or APP_URL not set - using default http://localhost:8086']
    });
    log.warn('VITE_APP_URL or APP_URL not set - using default http://localhost:8086');
  } else {
    log.info('App URL configured', { appUrl, callbackUrl: `${appUrl}/oauth/callback` });
  }

  // Summary
  log.info('Validation summary', {
    validPlatforms: results.valid.length,
    warnings: results.warnings.length,
    missingCredentials: results.missing.length,
    errors: results.errors.length
  });

  if (results.missing.length > 0) {
    log.info('To fix missing credentials: visit platform developer console, create OAuth app, add to .env, restart server');
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
