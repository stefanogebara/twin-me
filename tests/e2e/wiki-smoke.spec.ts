/**
 * Wiki Smoke Test — Self-contained, targets production
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'https://twin-ai-learn.vercel.app';
const JWT = process.env.TEST_AUTH_TOKEN || '';

test('wiki page renders on production', async ({ browser }) => {
  test.skip(!JWT, 'TEST_AUTH_TOKEN not set');

  // Create fresh context (no storageState dependency)
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate and inject auth
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

  await page.evaluate((token) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('token', token);
  }, JWT);

  // Navigate to wiki
  await page.goto(`${BASE_URL}/wiki`, { waitUntil: 'domcontentloaded', timeout: 20000 });

  // Wait for React to hydrate + API call
  await page.waitForTimeout(6000);

  // Screenshot #1: whatever is showing
  await page.screenshot({ path: 'test-screenshots/wiki-state-1.png', fullPage: true });

  // Log what we see
  const url = page.url();
  console.log('Current URL:', url);

  const bodyText = await page.textContent('body') || '';
  console.log('Body text length:', bodyText.length);

  // Check states
  if (url.includes('/auth')) {
    console.log('REDIRECT: Page redirected to auth - token may be invalid');
  } else if (bodyText.includes('Knowledge Base')) {
    console.log('SUCCESS: Knowledge Base heading found');

    // Check for domain cards
    const domains = ['Personality Profile', 'Lifestyle Patterns', 'Cultural Identity', 'Social Dynamics', 'Motivation'];
    for (const d of domains) {
      const found = bodyText.includes(d);
      console.log(`  ${found ? 'FOUND' : 'MISSING'}: ${d}`);
    }

    // Check for cross-refs
    const crossRefCount = (bodyText.match(/\[\[domain:/g) || []).length;
    console.log('  Cross-ref mentions in text:', crossRefCount);
  } else if (bodyText.includes('still being compiled')) {
    console.log('EMPTY: Wiki not yet compiled');
  } else if (bodyText.includes('Something went wrong')) {
    console.log('ERROR: API returned error');
  } else {
    console.log('UNKNOWN STATE. First 300 chars:', bodyText.slice(0, 300));
  }

  // Scroll down and take another screenshot
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-screenshots/wiki-state-2-scrolled.png', fullPage: true });

  await context.close();
});

test('wiki API returns pages', async ({ request }) => {
  test.skip(!JWT, 'TEST_AUTH_TOKEN not set');

  const response = await request.get(`${BASE_URL}/api/wiki/pages`, {
    headers: { 'Authorization': `Bearer ${JWT}` },
  });

  console.log('API status:', response.status());

  if (response.ok()) {
    const json = await response.json();
    console.log('API success:', json.success);
    console.log('Page count:', json.data?.length);
    for (const p of json.data || []) {
      console.log(`  ${p.domain}: v${p.version}, ${p.content_md?.length} chars, compiled ${p.compiled_at}`);
    }
    expect(json.success).toBe(true);
  } else {
    console.log('API failed:', await response.text());
  }
});
