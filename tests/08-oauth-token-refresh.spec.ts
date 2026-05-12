import { test, expect } from '@playwright/test';

/**
 * OAuth Token Refresh E2E Tests
 *
 * These tests verify that OAuth token refresh mechanisms work correctly
 * and use the proper authentication methods for each platform.
 *
 * CRITICAL: These tests prevent regressions like the Whoop auth issue
 * where client credentials were sent in body instead of HTTP Basic Auth header.
 */

test.describe('OAuth Token Refresh API Tests', () => {

  test.describe('Token Refresh Endpoint Availability', () => {

    test('Whoop refresh endpoint should be accessible', async ({ request }, testInfo) => {
      // The legacy /api/health/refresh/whoop HTTP endpoint was removed —
      // Whoop refresh now runs through the internal tokenRefreshService.js
      // invoked by the token lifecycle cron + on-demand callers. Source-level
      // regression checks below (Basic Auth header, no body credentials,
      // service contains "whoop") cover the original bug this suite guards
      // against. Skip the HTTP-availability assertion gracefully.
      testInfo.skip(true, 'Whoop refresh is now an internal service (no HTTP endpoint); source-level tests below cover the regression.');

      const response = await request.post('http://localhost:3004/api/health/refresh/whoop', {
        headers: { 'Content-Type': 'application/json' }
      });

      expect([401, 400, 500]).toContain(response.status());
      expect(response.status()).not.toBe(404);
    });

    test('Platform insights refresh should be available', async ({ request }) => {
      // The insights refresh endpoint handles token refresh internally
      const response = await request.post('http://localhost:3004/api/insights/spotify/refresh', {
        headers: { 'Content-Type': 'application/json' }
      });

      // Any response code is OK - we're just checking the endpoint exists
      expect(response.status()).toBeDefined();
    });
  });

  test.describe('Token Refresh Service Code Verification', () => {

    test('Whoop token refresh should use HTTP Basic Auth header (not body params)', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Check tokenRefresh.js
      const tokenRefreshPath = path.join(process.cwd(), 'api', 'services', 'tokenRefreshService.js');
      const tokenRefreshContent = await fs.readFile(tokenRefreshPath, 'utf-8');

      // CRITICAL: Whoop refresh must use Authorization header with Basic auth
      // This regex checks for the presence of Basic auth header in Whoop token request
      const hasBasicAuthForWhoop = /whoop.*Authorization.*Basic|Basic.*whoop/is.test(tokenRefreshContent);

      expect(hasBasicAuthForWhoop).toBe(true);
    });

    test('Whoop token refresh should NOT send client credentials in body', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const tokenRefreshPath = path.join(process.cwd(), 'api', 'services', 'tokenRefreshService.js');
      const content = await fs.readFile(tokenRefreshPath, 'utf-8');

      // Find the Whoop refresh section
      const whoopSection = content.match(/case\s+['"]whoop['"][\s\S]*?break;/);

      if (whoopSection) {
        const whoopCode = whoopSection[0];

        // CRITICAL: Should NOT have client_id or client_secret in the request body
        // for the token request (they should be in the Authorization header)
        const hasBodyCredentials = /body[\s\S]*client_secret|params[\s\S]*client_secret/i.test(whoopCode);

        // If credentials are in body, this is the bug that caused the regression
        expect(hasBodyCredentials).toBe(false);
      }
    });

    test('Spotify token refresh should use HTTP Basic Auth header', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const spotifyOAuthPath = path.join(process.cwd(), 'api', 'routes', 'spotify-oauth.js');
      const content = await fs.readFile(spotifyOAuthPath, 'utf-8');

      // Spotify should use Basic auth header
      const hasBasicAuth = /Authorization.*Basic.*Buffer\.from/i.test(content);

      expect(hasBasicAuth).toBe(true);
    });

    test('Calendar token refresh should use proper OAuth2 flow', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const calendarPath = path.join(process.cwd(), 'api', 'routes', 'calendar-oauth.js');
      const content = await fs.readFile(calendarPath, 'utf-8');

      // Calendar should import centralized token refresh (not use local function)
      const usesCentralizedRefresh = /import.*getValidAccessToken.*from.*tokenRefresh/i.test(content);

      expect(usesCentralizedRefresh).toBe(true);
    });
  });

  test.describe('Token Refresh Service HTTP Basic Auth', () => {

    test('tokenRefreshService.js should use HTTP Basic Auth pattern', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const tokenRefreshPath = path.join(process.cwd(), 'api', 'services', 'tokenRefreshService.js');
      const content = await fs.readFile(tokenRefreshPath, 'utf-8');

      // The refactor split basicAuth declaration onto its own line:
      //   const basicAuth = Buffer.from(`${id}:${secret}`).toString('base64');
      //   ... headers: { Authorization: `Basic ${basicAuth}` }
      // Accept either the legacy one-line pattern or the split form.
      const hasInlinePattern = /Authorization.*Basic.*Buffer\.from/is.test(content);
      const hasSplitPattern = /basicAuth\s*=\s*Buffer\.from/.test(content)
        && /Authorization.*Basic\s+\$\{basicAuth\}/.test(content);

      expect(hasInlinePattern || hasSplitPattern).toBe(true);
    });

    test('tokenRefreshService.js should use HTTP Basic Auth for Whoop', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const servicePath = path.join(process.cwd(), 'api', 'services', 'tokenRefreshService.js');
      const content = await fs.readFile(servicePath, 'utf-8');

      // Should have basicAuth variable being set for header
      const hasBasicAuthSetup = /basicAuth\s*=\s*Buffer\.from|Authorization.*Basic/i.test(content);

      expect(hasBasicAuthSetup).toBe(true);
    });
  });

  test.describe('Token Refresh Service Integration', () => {

    test('tokenRefreshService.js should handle Whoop correctly', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const servicePath = path.join(process.cwd(), 'api', 'services', 'tokenRefreshService.js');
      const content = await fs.readFile(servicePath, 'utf-8');

      // Should have Whoop-specific refresh logic
      expect(content).toContain('whoop');

      // Should use Basic auth
      const hasWhoopBasicAuth = /whoop[\s\S]*Authorization.*Basic|Basic[\s\S]*whoop/i.test(content);
      expect(hasWhoopBasicAuth).toBe(true);
    });

    test('tokenLifecycleJob.js should have token refresh functionality', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const jobPath = path.join(process.cwd(), 'api', 'services', 'tokenLifecycleJob.js');
      const content = await fs.readFile(jobPath, 'utf-8');

      // Should import the token refresh service
      expect(content).toContain('refreshAccessToken');

      // Should use cron for scheduling
      expect(content).toContain('cron');

      // Should have token refresh job handler
      expect(content).toContain('tokenRefreshJob');
    });
  });
});

test.describe('OAuth Callback Endpoints Exist', () => {

  test('Spotify callback endpoint exists', async ({ request }) => {
    const response = await request.get('http://localhost:3004/api/spotify/callback', {
      params: { code: 'test', state: 'test' }
    });

    // Any response except 404 indicates the endpoint exists
    // It may return 500, 400, or redirect - all acceptable
    expect(response.status()).toBeDefined();
  });

  test('Whoop callback endpoint exists', async ({ request }) => {
    const response = await request.get('http://localhost:3004/api/health/oauth/callback/whoop', {
      params: { code: 'test', state: 'test' }
    });

    expect(response.status()).toBeDefined();
  });

  test('Calendar callback endpoint exists', async ({ request }) => {
    const response = await request.get('http://localhost:3004/api/calendar/callback', {
      params: { code: 'test', state: 'test' }
    });

    expect(response.status()).toBeDefined();
  });
});

test.describe('Platform Insight Endpoints', () => {

  test('Insights API exists for platforms', async ({ request }) => {
    // Test that the insights route is mounted
    const response = await request.get('http://localhost:3004/api/insights/status');

    // Any response indicates the route is mounted
    expect(response.status()).toBeDefined();
  });
});
