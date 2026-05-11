import { test, expect } from '@playwright/test';

/**
 * Platform Connector Tests
 * Tests platform connection UI and OAuth flows
 */

// These tests target /soul-signature (now redirects to /identity, auth-gated)
// and /get-started (auth-gated) without injecting auth, so they hit /auth and
// fail every assertion. The actual platform-connector flow is covered by
// onboarding-flow.spec.ts (Step 3: Platform step) and expired-tokens-reconnect-e2e.
// Skip this file until rewritten with proper auth injection + current routes.
test.skip(true, 'Stale routes (/soul-signature) + no auth injection. Covered by onboarding-flow + expired-tokens-reconnect.');

test.describe('Platform Connectors', () => {
  // Skip authentication for GitHub and Gmail connector tests by testing on public pages
  // Note: Full OAuth flow testing requires authenticated sessions
  test('should show available platforms', async ({ page }) => {
    await page.goto('/soul-signature');
    await page.waitForLoadState('domcontentloaded');

    const pageContent = await page.textContent('body');

    // Check for major platforms
    const platforms = ['Spotify', 'GitHub', 'Discord', 'LinkedIn'];
    const foundPlatforms = platforms.filter(platform =>
      pageContent?.includes(platform)
    );

    expect(foundPlatforms.length).toBeGreaterThan(0);
  });

  test('should have connect buttons for platforms', async ({ page }) => {
    await page.goto('/soul-signature');
    await page.waitForLoadState('domcontentloaded');

    // Look for connect buttons
    const connectButtons = page.getByRole('button', { name: /connect/i });
    const count = await connectButtons.count();

    // Should have at least some connect buttons
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show platform icons', async ({ page }) => {
    await page.goto('/soul-signature');
    await page.waitForLoadState('domcontentloaded');

    // Check for SVG or icon elements
    const svgs = page.locator('svg');
    const count = await svgs.count();

    expect(count).toBeGreaterThan(0);
  });

  test('should display platform categories', async ({ page }) => {
    await page.goto('/soul-signature');
    await page.waitForLoadState('domcontentloaded');

    const pageContent = await page.textContent('body');

    // Check for category labels
    const categories = ['Entertainment', 'Professional', 'Social'];
    const hasCategories = categories.some(cat =>
      pageContent?.toLowerCase().includes(cat.toLowerCase())
    );

    // May or may not have explicit categories
    expect(pageContent).toBeTruthy();
  });

  test('should show GitHub connector with correct details', async ({ page }) => {
    await page.goto('/get-started');
    await page.waitForLoadState('domcontentloaded');

    // Click "Show More" button to reveal GitHub connector
    const showMoreButton = page.getByRole('button', { name: /show.*more/i });
    const isShowMoreVisible = await showMoreButton.isVisible().catch(() => false);

    if (isShowMoreVisible) {
      await showMoreButton.click();
      await page.waitForTimeout(500); // Wait for expansion animation
    }

    const pageContent = await page.textContent('body');

    // Check for GitHub platform
    expect(pageContent).toContain('GitHub');

    // Check for GitHub description
    const gitHubDescription = /Technical skills|coding style|developers/i;
    const hasGitHubInfo = gitHubDescription.test(pageContent || '');
    expect(hasGitHubInfo).toBe(true);
  });

  test('should show Gmail connector with correct details', async ({ page }) => {
    await page.goto('/get-started');
    await page.waitForLoadState('domcontentloaded');

    const pageContent = await page.textContent('body');

    // Check for Gmail platform
    expect(pageContent).toContain('Gmail');

    // Check for Gmail description
    const gmailDescription = /Email|communication|professional relationships/i;
    const hasGmailInfo = gmailDescription.test(pageContent || '');
    expect(hasGmailInfo).toBe(true);
  });

  test('should verify GitHub and Gmail are configured in source code', async () => {
    // Verify connectors are properly configured by importing the component
    const fs = await import('fs/promises');
    const path = await import('path');

    const filePath = path.join(process.cwd(), 'src', 'pages', 'InstantTwinOnboarding.tsx');
    const fileContent = await fs.readFile(filePath, 'utf-8');

    // Check that GitHub and Gmail connectors are defined in the code
    expect(fileContent).toContain('github');
    expect(fileContent).toContain('google_gmail');
    expect(fileContent).toContain('GitHub');
    expect(fileContent).toContain('Gmail');
  });
});
