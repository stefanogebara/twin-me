/**
 * TRIBE v2 E2E Tests
 * ==================
 * Tests all neuroscience-grounded features: ICA personality axes,
 * in-silico scoring, multimodal fusion, twin fidelity, scaling metrics,
 * and the UI components on Identity and Settings pages.
 */

import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:3004/api';

// Helper: get auth headers from stored state
async function getAuthToken(page: any): Promise<string> {
  return await page.evaluate(() => localStorage.getItem('auth_token') || '');
}

// ── API Tests ──────────────────────────────────────────────────────────

test.describe('TRIBE v2 API Endpoints', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('GET /api/tribe/scaling-metrics returns 200', async ({ page }) => {
    await page.goto('/dashboard');
    const token = await getAuthToken(page);

    const response = await page.request.get(`${API_URL}/tribe/scaling-metrics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
  });

  test('GET /api/tribe/fidelity returns 200', async ({ page }) => {
    await page.goto('/dashboard');
    const token = await getAuthToken(page);

    const response = await page.request.get(`${API_URL}/tribe/fidelity`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  test('GET /api/tribe/ica-axes returns personality axes', async ({ page }) => {
    await page.goto('/dashboard');
    const token = await getAuthToken(page);

    const response = await page.request.get(`${API_URL}/tribe/ica-axes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);

    const axes = json.data?.axes || json.data;
    expect(Array.isArray(axes)).toBe(true);
    expect(axes.length).toBeGreaterThan(0);

    // Each axis should have a label
    for (const axis of axes.slice(0, 5)) {
      expect(axis.label).toBeTruthy();
      expect(typeof axis.label).toBe('string');
    }
  });

  test('GET /api/twin/multimodal-profile returns fused vector', async ({ page }) => {
    await page.goto('/dashboard');
    const token = await getAuthToken(page);

    const response = await page.request.get(`${API_URL}/twin/multimodal-profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.fused_vector).toBeDefined();
    expect(json.data.fused_vector.length).toBe(32);
    expect(json.data.modality_count).toBeGreaterThan(0);
  });

  test('POST /api/tribe/in-silico scores stimuli', async ({ page }) => {
    await page.goto('/dashboard');
    const token = await getAuthToken(page);

    const response = await page.request.post(`${API_URL}/tribe/in-silico`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        stimuli: [
          { text: 'A new Drake album just dropped' },
          { text: 'Your HRV is trending up this week' },
          { text: 'React conference next month' },
        ],
      },
    });
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBe(3);

    for (const item of json.data) {
      expect(item.text).toBeTruthy();
      expect(typeof item.predictedEngagement).toBe('number');
    }
  });

  test('GET /api/finetuning/readiness returns training status', async ({ page }) => {
    await page.goto('/dashboard');
    const token = await getAuthToken(page);

    const response = await page.request.get(`${API_URL}/finetuning/readiness`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(typeof json.data.eligible).toBe('boolean');
    expect(typeof json.data.conversations).toBe('number');
    expect(json.data.conversations).toBeGreaterThan(0);
  });

  test('POST /api/tribe/in-silico rejects empty stimuli', async ({ page }) => {
    await page.goto('/dashboard');
    const token = await getAuthToken(page);

    const response = await page.request.post(`${API_URL}/tribe/in-silico`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { stimuli: [] },
    });
    expect(response.status()).toBe(400);
  });
});

// ── UI Tests ───────────────────────────────────────────────────────────

test.describe('TRIBE v2 UI Components', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('Identity page shows Personality Dimensions section', async ({ page }) => {
    await page.goto('/identity');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Click Explore to dismiss hero overlay
    const exploreBtn = page.getByRole('button', { name: 'Explore' });
    if (await exploreBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await exploreBtn.click();
      await page.waitForTimeout(2000);
    }

    // Scroll to bottom to find Personality Dimensions
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    // Look for Personality Dimensions section (uppercase in UI)
    const section = page.getByText(/personality dimensions/i);
    await expect(section.first()).toBeVisible({ timeout: 10000 });

    // Should show ICA badge
    const icaBadge = page.getByText('ICA');
    await expect(icaBadge).toBeVisible();

    // Should show axis count text
    const countText = page.getByText(/behavioral patterns discovered/);
    await expect(countText).toBeVisible();
  });

  test('Personality axes expand on click to show description', async ({ page }) => {
    await page.goto('/identity');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Dismiss hero
    const exploreBtn = page.getByRole('button', { name: 'Explore' });
    if (await exploreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await exploreBtn.click();
      await page.waitForTimeout(1000);
    }

    // Scroll to personality dimensions
    await page.getByText('Personality Dimensions').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // Find and click first axis
    const firstAxis = page.locator('text=Deeply Empathetic Builder').first();
    if (await firstAxis.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstAxis.click();
      await page.waitForTimeout(500);

      // Description should appear
      const evidence = page.getByText('Evidence');
      await expect(evidence).toBeVisible({ timeout: 3000 });
    }
  });

  test('Settings page shows Twin Intelligence section', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Look for Twin Intelligence section
    const section = page.getByText('Twin Intelligence');
    await expect(section).toBeVisible({ timeout: 10000 });

    // Should show Twin Accuracy row
    const accuracy = page.getByText('Twin Accuracy');
    await expect(accuracy).toBeVisible();

    // Should show Personal Model row
    const model = page.getByText('Personal Model');
    await expect(model).toBeVisible();

    // Should show Training Data row
    const training = page.getByText('Training Data');
    await expect(training).toBeVisible();
  });
});
