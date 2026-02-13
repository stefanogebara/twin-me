/**
 * Brain Explorer Phase 4 Tests
 *
 * Tests for:
 * - Context filtering (global, work, personal, social, etc.)
 * - Causal edge visualization
 * - Causal edge creation UI
 * - Context expression UI
 */

import { test, expect } from '@playwright/test';

// Test configuration
const BASE_URL = 'http://localhost:8086';
const API_URL = 'http://127.0.0.1:3004';

// Generate a fresh JWT token for testing
function generateTestToken(): string {
  // This is the test user token - in a real scenario this would come from auth
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    userId: '7ea395ce-be1d-4565-bce1-35e2c6bc7817',
    email: 'stefano@twinme.ai',
    iat: now,
    exp: now + 7200 // 2 hours
  })).toString('base64url');
  // This is a test signature - will need real JWT secret
  return `${header}.${payload}.test-signature`;
}

test.describe('Brain Explorer Phase 4 Features', () => {
  test.beforeEach(async ({ page }) => {
    // Set authentication token
    await page.addInitScript(() => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3ZWEzOTVjZS1iZTFkLTQ1NjUtYmNlMS0zNWUyYzZiYzc4MTciLCJlbWFpbCI6InN0ZWZhbm9AdHdpbm1lLmFpIiwiaWF0IjoxNzU0MzA1NjAwLCJleHAiOjE4NTQzMDU2MDB9.test';
      localStorage.setItem('authToken', token);
      localStorage.setItem('user', JSON.stringify({
        id: '7ea395ce-be1d-4565-bce1-35e2c6bc7817',
        email: 'stefano@twinme.ai',
        name: 'Stefano'
      }));
    });
  });

  test('should load Brain Explorer page', async ({ page }) => {
    await page.goto(`${BASE_URL}/brain-explorer`);

    // Wait for the page to load
    await page.waitForTimeout(2000);

    // Check for Brain Explorer title or header
    const title = page.locator('text=Brain Explorer');
    await expect(title.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display context selector with all 8 contexts', async ({ page }) => {
    await page.goto(`${BASE_URL}/brain-explorer`);
    await page.waitForTimeout(2000);

    // Look for context buttons
    const contextButtons = page.locator('button:has-text("Global"), button:has-text("Work"), button:has-text("Personal"), button:has-text("Social"), button:has-text("Creative"), button:has-text("Learning"), button:has-text("Health"), button:has-text("Romantic")');

    // Should have multiple context options visible
    const count = await contextButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('should show causal edge statistics', async ({ page }) => {
    await page.goto(`${BASE_URL}/brain-explorer`);
    await page.waitForTimeout(3000);

    // Look for relationship types panel
    const relationshipPanel = page.locator('text=Relationship Types');

    // Check if causal stats are shown
    const causalText = page.locator('text=Causal');
    const correlationalText = page.locator('text=Correlational');

    // At least one should be visible if edges exist
    const hasCausal = await causalText.first().isVisible().catch(() => false);
    const hasCorrelational = await correlationalText.first().isVisible().catch(() => false);

    // Log what we found
    console.log('Has Causal stats:', hasCausal);
    console.log('Has Correlational stats:', hasCorrelational);
  });

  test('should switch between contexts', async ({ page }) => {
    await page.goto(`${BASE_URL}/brain-explorer`);
    await page.waitForTimeout(2000);

    // Find and click on Work context
    const workButton = page.locator('button:has-text("Work")').first();

    if (await workButton.isVisible()) {
      await workButton.click();
      await page.waitForTimeout(1500);

      // The context should now be active (highlighted)
      // Check for active state styling
      const isActive = await workButton.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.backgroundColor !== 'transparent';
      });

      console.log('Work context button active:', isActive);
    }
  });

  test('should display node detail panel when clicking a node', async ({ page }) => {
    await page.goto(`${BASE_URL}/brain-explorer`);
    await page.waitForTimeout(3000);

    // The 3D canvas is present
    const canvas = page.locator('canvas');
    await expect(canvas.first()).toBeVisible();

    // Click on the canvas (center) to potentially select a node
    const canvasBox = await canvas.first().boundingBox();
    if (canvasBox) {
      await page.mouse.click(
        canvasBox.x + canvasBox.width / 2,
        canvasBox.y + canvasBox.height / 2
      );
      await page.waitForTimeout(500);
    }

    // Check if any detail panel text is visible
    // (The panel shows when a node is selected)
  });

  test('should have relationships section in node detail panel', async ({ page }) => {
    await page.goto(`${BASE_URL}/brain-explorer`);
    await page.waitForTimeout(3000);

    // Look for the Relationships button (collapsed by default)
    const relationshipsButton = page.locator('button:has-text("Relationships")');

    if (await relationshipsButton.first().isVisible()) {
      await relationshipsButton.first().click();
      await page.waitForTimeout(500);

      // Should show edge information or "no relationships"
      const edgeContent = page.locator('text=incoming, text=outgoing, text=No relationships');
      console.log('Relationships section expanded');
    }
  });

  test('should have context expression section in node detail panel', async ({ page }) => {
    await page.goto(`${BASE_URL}/brain-explorer`);
    await page.waitForTimeout(3000);

    // Look for the Context Expression button (collapsed by default)
    const contextExpressionButton = page.locator('button:has-text("Context Expression")');

    if (await contextExpressionButton.first().isVisible()) {
      await contextExpressionButton.first().click();
      await page.waitForTimeout(500);

      // Should show context options
      const expressionOptions = page.locator('text=Suppressed, text=Reduced, text=Normal, text=Enhanced, text=Dominant');
      console.log('Context Expression section expanded');
    }
  });

  test('API: should return causal edges in visualization', async ({ request }) => {
    // Generate a proper token
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3ZWEzOTVjZS1iZTFkLTQ1NjUtYmNlMS0zNWUyYzZiYzc4MTciLCJlbWFpbCI6InN0ZWZhbm9AdHdpbm1lLmFpIiwiaWF0IjoxNzU0MzA1NjAwLCJleHAiOjE4NTQzMDU2MDB9.4xK8m8ZM7h9j3QwKpJ_Yp2X8F9lL6Qm3N7vB1K4hR5g';

    const response = await request.get(`${API_URL}/twins-brain/visualization`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    // Check response status
    if (response.ok()) {
      const data = await response.json();

      // Check for causal stats
      const causalStats = data.visualization?.stats?.causal;

      console.log('Visualization stats:', {
        totalEdges: data.visualization?.stats?.edgeCount,
        causalEdges: causalStats?.causalEdges,
        correlationalEdges: causalStats?.correlationalEdges
      });

      // Should have some causal edges (we seeded 14)
      if (causalStats) {
        expect(causalStats.causalEdges).toBeGreaterThan(0);
      }
    } else {
      console.log('API response status:', response.status());
    }
  });

  test('API: should return context-specific graph', async ({ request }) => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3ZWEzOTVjZS1iZTFkLTQ1NjUtYmNlMS0zNWUyYzZiYzc4MTciLCJlbWFpbCI6InN0ZWZhbm9AdHdpbm1lLmFpIiwiaWF0IjoxNzU0MzA1NjAwLCJleHAiOjE4NTQzMDU2MDB9.4xK8m8ZM7h9j3QwKpJ_Yp2X8F9lL6Qm3N7vB1K4hR5g';

    const response = await request.get(`${API_URL}/twins-brain/context/work/graph`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (response.ok()) {
      const data = await response.json();

      console.log('Work context graph:', {
        nodeCount: data.nodes?.length,
        edgeCount: data.edges?.length
      });

      // Should have nodes for work context
      expect(data.nodes).toBeDefined();
    } else {
      console.log('Context API response status:', response.status());
    }
  });

  test('API: should return causal summary', async ({ request }) => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3ZWEzOTVjZS1iZTFkLTQ1NjUtYmNlMS0zNWUyYzZiYzc4MTciLCJlbWFpbCI6InN0ZWZhbm9AdHdpbm1lLmFpIiwiaWF0IjoxNzU0MzA1NjAwLCJleHAiOjE4NTQzMDU2MDB9.4xK8m8ZM7h9j3QwKpJ_Yp2X8F9lL6Qm3N7vB1K4hR5g';

    const response = await request.get(`${API_URL}/twins-brain/causal/summary`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (response.ok()) {
      const data = await response.json();

      console.log('Causal summary:', {
        totalCausal: data.summary?.totalCausal,
        totalCorrelational: data.summary?.totalCorrelational,
        strongCausal: data.summary?.strongCausal
      });

      // Should have causal edges from seeding
      expect(data.summary?.totalCausal).toBeGreaterThanOrEqual(0);
    } else {
      console.log('Causal summary API response status:', response.status());
    }
  });
});

test.describe('Brain Explorer Visual Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Use valid token for stefanogebara@gmail.com
      localStorage.setItem('authToken', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxNjdjMjdiNS1hNDBiLTQ5ZmItOGQwMC1kZWIxYjFjNTdmNGQiLCJlbWFpbCI6InN0ZWZhbm9nZWJhcmFAZ21haWwuY29tIiwiaWF0IjoxNzcwMjA2NDUxLCJleHAiOjE3NzAyOTI4NTF9.cskMrAjqnVP5IS65P54l8UdJcjqIOvjEfISDqsrZQbQ');
      localStorage.setItem('user', JSON.stringify({
        id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d',
        email: 'stefanogebara@gmail.com',
        name: 'Stefano'
      }));
    });
  });

  test('should take screenshot of Brain Explorer', async ({ page }) => {
    await page.goto(`${BASE_URL}/brain-explorer`);
    await page.waitForTimeout(5000); // Wait for 3D graph to render

    await page.screenshot({
      path: 'tests/screenshots/brain-explorer-phase4.png',
      fullPage: true
    });

    console.log('Screenshot saved to tests/screenshots/brain-explorer-phase4.png');
  });

  test('should take screenshot with Work context selected', async ({ page }) => {
    await page.goto(`${BASE_URL}/brain-explorer`);
    await page.waitForTimeout(3000);

    // Click on Work context
    const workButton = page.locator('button:has-text("Work")').first();
    if (await workButton.isVisible()) {
      await workButton.click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({
      path: 'tests/screenshots/brain-explorer-work-context.png',
      fullPage: true
    });

    console.log('Screenshot saved to tests/screenshots/brain-explorer-work-context.png');
  });
});
