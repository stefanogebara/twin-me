/**
 * Enrichment Flow E2E Test
 * Tests the onboarding discovery flow with Brave Search enrichment
 * for Christian Gebara (cmgebara@gmail.com) — a well-known CEO.
 *
 * KEY: Clears existing enrichment data first so the frontend triggers
 * a fresh /enrichment/search call (otherwise it finds stale data and skips).
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_URL = 'http://localhost:8086';
const API_URL = 'http://localhost:3004';
const SCREENSHOTS_DIR = path.join(__dirname, 'enrichment-test-screenshots');

// Generate a fresh JWT at runtime
dotenv.config({ path: path.join(__dirname, 'api', '.env') });
const JWT_TOKEN = jwt.sign(
  { id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d', email: 'stefanogebara@gmail.com', userId: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d' },
  process.env.JWT_SECRET,
  { expiresIn: '2h' }
);

const TEST_USER = {
  id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d',
  email: 'stefanogebara@gmail.com',
  firstName: 'Stefano',
  lastName: 'Gebara',
  fullName: 'Stefano Gebara'
};

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function log(message, type = 'info') {
  const prefix = { info: 'i', success: '+', error: 'x', warning: '!', test: '>' }[type] || ' ';
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}][${prefix}] ${message}`);
}

async function clearExistingEnrichment() {
  log('Clearing existing enrichment data for test user...', 'test');
  try {
    const response = await fetch(`${API_URL}/api/enrichment/clear/${TEST_USER.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      log(`Enrichment data cleared: ${JSON.stringify(data)}`, 'success');
    } else {
      log(`Clear response: ${response.status} - ${JSON.stringify(data)}`, 'warning');
    }
  } catch (err) {
    log(`Clear request failed (may be OK if no data): ${err.message}`, 'warning');
  }
}

async function runEnrichmentTest() {
  console.log('\n' + '='.repeat(70));
  console.log('   ENRICHMENT FLOW E2E TEST — Stefano Gebara (stefanogebara@gmail.com)');
  console.log('='.repeat(70) + '\n');

  log(`JWT Token (first 50 chars): ${JWT_TOKEN.substring(0, 50)}...`, 'info');

  // Step 0: Clear existing enrichment data so the frontend triggers a fresh search
  await clearExistingEnrichment();

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
    channel: 'chrome',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  // Capture browser console logs
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error') {
      log(`[BROWSER ERROR] ${msg.text()}`, 'error');
    } else if (msg.text().includes('enrichment') || msg.text().includes('Enrichment') || msg.text().includes('auth') || msg.text().includes('Auth')) {
      log(`[BROWSER] ${msg.text()}`, 'info');
    }
  });

  // Track all enrichment API responses
  const enrichmentRequests = [];
  const allApiRequests = [];
  let searchResponseData = null;

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      const status = response.status();
      allApiRequests.push({ url: url.replace(API_URL, ''), status, time: new Date().toLocaleTimeString() });
      if (status === 401 || status === 403) {
        log(`AUTH FAILED: ${url} [${status}]`, 'error');
      }
    }
    if (url.includes('/enrichment/')) {
      const status = response.status();
      let body = null;
      try { body = await response.json(); } catch {}
      enrichmentRequests.push({ url, status, body, time: new Date().toLocaleTimeString() });
      const endpoint = url.split('/enrichment/')[1]?.split('?')[0] || url;
      log(`API [${endpoint}]: ${status}`, status === 200 ? 'success' : 'error');

      // Log key fields from search response
      if (url.includes('/enrichment/search') && body?.data) {
        searchResponseData = body.data;
        const d = body.data;
        if (d.discovered_name) log(`  name: ${d.discovered_name}`, 'success');
        if (d.discovered_company) log(`  company: ${d.discovered_company}`, 'success');
        if (d.discovered_title) log(`  title: ${d.discovered_title}`, 'success');
        if (d.discovered_location) log(`  location: ${d.discovered_location}`, 'success');
        if (d.career_timeline) log(`  career: ${d.career_timeline.substring(0, 120)}...`, 'success');
        if (d.education) log(`  education: ${String(d.education).substring(0, 120)}...`, 'success');
      }
    }
  });

  try {
    // Step 1: Inject auth into localStorage BEFORE the React app loads
    log('Injecting auth via addInitScript...', 'test');
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
    }, { token: JWT_TOKEN, user: TEST_USER });

    // Step 2: Navigate to /discover
    // Use 'load' instead of 'networkidle' — the enrichment API calls keep the network busy
    log('Navigating to /discover...', 'test');
    await page.goto(`${FRONTEND_URL}/discover`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-discover-start.png') });
    log(`Page URL: ${page.url()}`, 'info');

    // Check if we got redirected
    if (page.url().includes('login') || page.url().includes('auth')) {
      log('REDIRECTED TO LOGIN — auth injection failed!', 'error');
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'login-redirect.png') });

      // Debug: check what's in localStorage
      const authState = await page.evaluate(() => ({
        auth_token: localStorage.getItem('auth_token')?.substring(0, 30),
        auth_user: localStorage.getItem('auth_user')?.substring(0, 50),
      }));
      log(`localStorage: ${JSON.stringify(authState)}`, 'info');
      return;
    }

    // Step 3: Wait for the /enrichment/search response (the critical one)
    // The flow is: quick -> status -> search (since we cleared existing data)
    log('Waiting for /enrichment/search response (up to 90s)...', 'test');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-enrichment-loading.png') });

    try {
      await page.waitForResponse(
        response => response.url().includes('/enrichment/search') && response.status() === 200,
        { timeout: 90000 }
      );
      log('/enrichment/search response received!', 'success');
    } catch {
      log('/enrichment/search did not respond within 90s', 'warning');

      // Debug: check what API calls were made
      log(`API calls so far: ${allApiRequests.map(r => `${r.status} ${r.url}`).join(', ')}`, 'info');
    }

    // Step 4: Wait for UI to update after data arrives
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-enrichment-results.png') });

    // Step 5: Check for "Continue" button (appears when orbPhase === 'alive')
    const continueButton = await page.$('button:has-text("Continue")');
    if (continueButton) {
      log('Continue button found — enrichment completed!', 'success');
    } else {
      log('Continue button not visible yet', 'warning');
      // Wait a bit more
      await page.waitForTimeout(5000);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03b-waiting-more.png') });
    }

    // Step 6: Capture final state
    const bodyText = await page.textContent('body');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-final-state.png'), fullPage: true });

    // Check what's visible on the page
    const checks = {
      'Stefano Gebara': /stefano.*gebara/i.test(bodyText),
      'Continue button': /Continue/i.test(bodyText),
      'Hello': /Hello/i.test(bodyText),
      'Name field': /NAME/i.test(bodyText),
      'Company or Title': /COMPANY|TITLE/i.test(bodyText),
    };

    console.log('\n--- Page Content Checks ---');
    let passCount = 0;
    for (const [label, found] of Object.entries(checks)) {
      log(`${label}: ${found ? 'FOUND' : 'not found'}`, found ? 'success' : 'warning');
      if (found) passCount++;
    }

    // All API requests summary
    console.log('\n--- All API Requests (chronological) ---');
    for (const req of allApiRequests) {
      const icon = req.status >= 400 ? 'error' : 'success';
      log(`[${req.time}] ${req.status} ${req.url}`, icon);
    }

    // Enrichment summary
    console.log('\n--- Enrichment API Summary ---');
    log(`Total enrichment API calls: ${enrichmentRequests.length}`, 'info');
    for (const req of enrichmentRequests) {
      const endpoint = req.url.split('/enrichment/')[1]?.split('?')[0] || req.url;
      const hasData = !!(req.body?.data);
      const source = req.body?.data?.source || req.body?.source || 'n/a';
      log(`[${req.time}] ${endpoint}: status=${req.status}, source=${source}, hasData=${hasData}`, hasData ? 'success' : 'warning');
    }

    // Career fields check from search response
    if (searchResponseData) {
      console.log('\n--- Search Response Fields ---');
      const careerFields = ['discovered_name', 'discovered_company', 'discovered_title', 'discovered_location',
        'discovered_linkedin_url', 'discovered_bio', 'discovered_summary', 'career_timeline', 'education',
        'achievements', 'skills'];
      for (const f of careerFields) {
        const val = searchResponseData[f];
        if (val) {
          const display = typeof val === 'string' ? val.substring(0, 100) : JSON.stringify(val).substring(0, 100);
          log(`${f}: ${display}`, 'success');
        }
      }

      console.log('\n--- Personal Fields ---');
      const personalFields = ['interests_and_hobbies', 'causes_and_values', 'notable_quotes',
        'public_appearances', 'personality_traits', 'life_story', 'social_media_presence',
        'discovered_instagram_url', 'discovered_personal_website'];
      let foundCount = 0;
      for (const f of personalFields) {
        const val = searchResponseData[f];
        if (val) {
          const display = typeof val === 'string' ? val.substring(0, 100) : JSON.stringify(val).substring(0, 100);
          log(`${f}: ${display}`, 'success');
          foundCount++;
        }
      }
      log(`Personal fields: ${foundCount}/${personalFields.length}`, foundCount > 0 ? 'success' : 'warning');
    } else {
      console.log('\n--- No search response data captured ---');
    }

    console.log('\n' + '='.repeat(70));
    log(`Enrichment E2E Test Complete! (${passCount}/${Object.keys(checks).length} page checks passed)`, passCount > 3 ? 'success' : 'warning');
    console.log(`Screenshots: ${SCREENSHOTS_DIR}`);
    console.log('='.repeat(70) + '\n');

    // Keep browser open briefly to see results
    log('Closing in 5 seconds...', 'info');
    await page.waitForTimeout(5000);

  } catch (error) {
    log(`Test error: ${error.message}`, 'error');
    console.error(error.stack);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error.png') }).catch(() => {});
  } finally {
    await context.close();
    await browser.close();
  }
}

runEnrichmentTest().catch(console.error);
