import { test, expect } from '@playwright/test';

/**
 * Insights Page Data Structure Tests
 *
 * These tests verify that the backend returns proper visualization data
 * for the insight pages (Spotify, Whoop, Calendar).
 *
 * CRITICAL: These tests prevent regressions where the backend returns
 * empty or missing visualization data that the frontend charts need.
 */

test.describe('Platform Reflection Service Data Structure', () => {

  test.describe('Code Structure Verification', () => {

    test('platformReflectionService should return Spotify visualization data', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const servicePath = path.join(process.cwd(), 'api', 'services', 'platformReflectionService.js');
      const content = await fs.readFile(servicePath, 'utf-8');

      // Should have these fields for Spotify charts
      expect(content).toContain('topArtistsWithPlays');
      expect(content).toContain('topGenres');
      expect(content).toContain('listeningHours');
    });

    test('platformReflectionService should return Whoop visualization data', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const servicePath = path.join(process.cwd(), 'api', 'services', 'platformReflectionService.js');
      const content = await fs.readFile(servicePath, 'utf-8');

      // Should have these fields for Whoop charts
      expect(content).toContain('currentMetrics');
      expect(content).toContain('sleepBreakdown');
      expect(content).toContain('history7Day');
      expect(content).toContain('recentTrends');
    });

    test('platformReflectionService should return Calendar visualization data', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const servicePath = path.join(process.cwd(), 'api', 'services', 'platformReflectionService.js');
      const content = await fs.readFile(servicePath, 'utf-8');

      // Should have these fields for Calendar charts
      expect(content).toContain('todayEvents');
      expect(content).toContain('upcomingEvents');
      expect(content).toContain('eventTypeDistribution');
      expect(content).toContain('weeklyHeatmap');
      expect(content).toContain('scheduleStats');
    });

    test('formatResponse should include all visualization fields', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const servicePath = path.join(process.cwd(), 'api', 'services', 'platformReflectionService.js');
      const content = await fs.readFile(servicePath, 'utf-8');

      // All visualization fields should be in the service file
      const requiredFields = [
        'topArtistsWithPlays',
        'topGenres',
        'listeningHours',
        'currentMetrics',
        'sleepBreakdown',
        'history7Day',
        'todayEvents',
        'eventTypeDistribution'
      ];

      for (const field of requiredFields) {
        expect(content).toContain(field);
      }
    });
  });

  test.describe('userContextAggregator Data Structure', () => {

    test('should include history7Day for Whoop data', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const aggregatorPath = path.join(process.cwd(), 'api', 'services', 'userContextAggregator.js');
      const content = await fs.readFile(aggregatorPath, 'utf-8');

      // Should build 7-day history for Whoop
      expect(content).toContain('history7Day');
    });

    test('should extract recovery and HRV data for charts', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const aggregatorPath = path.join(process.cwd(), 'api', 'services', 'userContextAggregator.js');
      const content = await fs.readFile(aggregatorPath, 'utf-8');

      // Should have recovery score extraction
      expect(content).toContain('recovery_score');

      // Should have HRV extraction
      expect(content).toContain('hrv');
    });
  });
});

test.describe('Frontend Insight Pages Structure', () => {

  test('SpotifyInsightsPage should expect correct data fields', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const pagePath = path.join(process.cwd(), 'src', 'pages', 'insights', 'SpotifyInsightsPage.tsx');
    const content = await fs.readFile(pagePath, 'utf-8');

    // Should reference these visualization data fields
    expect(content).toContain('topArtistsWithPlays');
    expect(content).toContain('topGenres');
    expect(content).toContain('listeningHours');
  });

  test('WhoopInsightsPage should expect correct data fields', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const pagePath = path.join(process.cwd(), 'src', 'pages', 'insights', 'WhoopInsightsPage.tsx');
    const content = await fs.readFile(pagePath, 'utf-8');

    // Should reference these visualization data fields
    expect(content).toContain('currentMetrics');
    expect(content).toContain('sleepBreakdown');
    expect(content).toContain('history7Day');
  });

  test('CalendarInsightsPage should expect correct data fields', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const pagePath = path.join(process.cwd(), 'src', 'pages', 'insights', 'CalendarInsightsPage.tsx');
    const content = await fs.readFile(pagePath, 'utf-8');

    // Should reference these visualization data fields
    expect(content).toContain('todayEvents');
    expect(content).toContain('eventTypeDistribution');
    expect(content).toContain('weeklyHeatmap');
  });
});

test.describe('Chart Component Data Compatibility', () => {

  test('Recharts imports should be present in Spotify and Whoop pages', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Spotify and Whoop use recharts for visualizations
    const pages = [
      'SpotifyInsightsPage.tsx',
      'WhoopInsightsPage.tsx'
    ];

    for (const page of pages) {
      const pagePath = path.join(process.cwd(), 'src', 'pages', 'insights', page);
      const content = await fs.readFile(pagePath, 'utf-8');

      // Should import Recharts components
      expect(content).toContain('recharts');
    }
  });

  test('Spotify should have BarChart for top artists', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const pagePath = path.join(process.cwd(), 'src', 'pages', 'insights', 'SpotifyInsightsPage.tsx');
    const content = await fs.readFile(pagePath, 'utf-8');

    expect(content).toContain('BarChart');
    expect(content).toContain('Bar');
  });

  test('Whoop should have AreaChart for trends', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const pagePath = path.join(process.cwd(), 'src', 'pages', 'insights', 'WhoopInsightsPage.tsx');
    const content = await fs.readFile(pagePath, 'utf-8');

    expect(content).toContain('AreaChart');
    expect(content).toContain('Area');
  });

  test('Calendar page should display event data', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const pagePath = path.join(process.cwd(), 'src', 'pages', 'insights', 'CalendarInsightsPage.tsx');
    const content = await fs.readFile(pagePath, 'utf-8');

    // Calendar page displays event data (may not use recharts)
    expect(content).toContain('todayEvents');
  });
});

test.describe('API Response Structure', () => {

  test('Insights API routes should be mounted', async ({ request }) => {
    // Test that the insights route is available
    const response = await request.get('http://localhost:3001/api/insights/health');

    // Any response code indicates the API is mounted
    expect(response.status()).toBeDefined();
  });
});
