/**
 * Environment Configuration for Soul Signature Extension
 * Change ENV to 'production' before publishing to Chrome Web Store
 */

// SET THIS TO 'development' FOR LOCAL TESTING
// The build-for-store script copies to dist/ with 'production' so source stays on dev
const ENV = 'production'; // 'development' or 'production'

// Configuration by environment
const CONFIG = {
  development: {
    APP_URL: 'http://localhost:8086',
    API_URL: 'http://localhost:3004/api'
  },
  production: {
    // audit-2026-05-27: canonical prod domain is www.twinme.me since the
    // 2026-05-13 domain migration. The old twin-ai-learn.vercel.app alias
    // still routes here, but every popup link should land on twinme.me.
    APP_URL: 'https://www.twinme.me',
    API_URL: 'https://www.twinme.me/api'
  }
};

// Current environment config
export const EXTENSION_CONFIG = CONFIG[ENV];
export const ENVIRONMENT = ENV;

// Debug logging only in development
if (ENV === 'development') {
  console.log(`[Soul Signature] Environment: ${ENV}`, EXTENSION_CONFIG);
}
