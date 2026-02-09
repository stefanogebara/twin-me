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
    APP_URL: 'https://twin-ai-learn.vercel.app',
    API_URL: 'https://twin-ai-learn.vercel.app/api'
  }
};

// Current environment config
export const EXTENSION_CONFIG = CONFIG[ENV];
export const ENVIRONMENT = ENV;

// Debug logging only in development
if (ENV === 'development') {
  console.log(`[Soul Signature] Environment: ${ENV}`, EXTENSION_CONFIG);
}
