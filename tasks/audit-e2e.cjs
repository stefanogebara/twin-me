const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'audit-screenshots');
const BASE_URL = 'http://localhost:8086';

const ROUTES = [
  { path: '/', name: 'landing' },
  { path: '/auth', name: 'auth' },
  { path: '/discover', name: 'discover' },
  { path: '/get-started', name: 'get-started' },
  { path: '/dashboard', name: 'dashboard' },
  { path: '/identity', name: 'identity' },
  { path: '/chat', name: 'chat' },
  { path: '/settings', name: 'settings' },
  { path: '/privacy', name: 'privacy' },
  { path: '/goals', name: 'goals' },
];

const VIEWPORTS = [
  { width: 1440, height: 900, label: 'desktop' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 390, height: 844, label: 'mobile' },
];

async function runAudit() {
  const findings = [];
  const browser = await chromium.launch({ headless: true });

  for (const route of ROUTES) {
    console.log(`\n=== Testing route: ${route.path} (${route.name}) ===`);

    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();

      const consoleErrors = [];
      const consoleWarnings = [];
      const networkErrors = [];

      // Capture console messages
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        } else if (msg.type() === 'warning') {
          consoleWarnings.push(msg.text());
        }
      });

      // Capture network failures
      page.on('requestfailed', (request) => {
        networkErrors.push({
          url: request.url(),
          failure: request.failure()?.errorText || 'unknown',
        });
      });

      // Track 404 responses
      const notFoundRequests = [];
      page.on('response', (response) => {
        if (response.status() === 404) {
          notFoundRequests.push(response.url());
        }
      });

      try {
        const response = await page.goto(`${BASE_URL}${route.path}`, {
          waitUntil: 'networkidle',
          timeout: 15000,
        });

        const statusCode = response?.status() || 0;
        const finalUrl = page.url();
        const redirected = finalUrl !== `${BASE_URL}${route.path}`;

        // Wait a bit for any lazy-loaded content
        await page.waitForTimeout(1000);

        // Check for blank page
        const bodyHTML = await page.evaluate(() => document.body?.innerHTML || '');
        const isBlank = bodyHTML.trim().length < 50;
        const hasOnlyRoot = bodyHTML.trim() === '<div id="root"></div>' || bodyHTML.includes('<div id="root"></div>') && bodyHTML.length < 100;

        // Check for visible text content
        const visibleText = await page.evaluate(() => document.body?.innerText?.trim() || '');
        const hasVisibleContent = visibleText.length > 10;

        // Take screenshot
        const screenshotName = `${route.name}-${viewport.label}.png`;
        const screenshotPath = path.join(SCREENSHOT_DIR, screenshotName);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        // Build finding
        const finding = {
          route: route.path,
          name: route.name,
          viewport: viewport.label,
          statusCode,
          redirected,
          redirectedTo: redirected ? finalUrl.replace(BASE_URL, '') : null,
          isBlank: isBlank || hasOnlyRoot,
          hasVisibleContent,
          consoleErrors: consoleErrors.filter(e => !e.includes('the server responded with a status of')), // filter duplicate network errors
          consoleWarnings: consoleWarnings.length,
          networkErrors,
          notFoundRequests: notFoundRequests.filter(u => !u.includes('favicon.ico')),
          screenshot: screenshotName,
        };

        // Categorize issues
        if (isBlank || hasOnlyRoot) {
          finding.issue = 'BLANK PAGE';
          finding.severity = 'CRITICAL';
        } else if (!hasVisibleContent) {
          finding.issue = 'NO VISIBLE TEXT';
          finding.severity = 'HIGH';
        }

        if (consoleErrors.length > 0) {
          finding.jsErrors = true;
          if (!finding.severity) {
            finding.severity = 'MEDIUM';
            finding.issue = 'JS CONSOLE ERRORS';
          }
        }

        if (notFoundRequests.length > 0) {
          finding.has404s = true;
          if (!finding.severity) {
            finding.severity = 'MEDIUM';
            finding.issue = '404 REQUESTS';
          }
        }

        if (networkErrors.length > 0) {
          finding.hasNetworkErrors = true;
          if (!finding.severity) {
            finding.severity = 'LOW';
            finding.issue = 'NETWORK ERRORS';
          }
        }

        findings.push(finding);

        console.log(`  [${viewport.label}] Status: ${statusCode}${redirected ? ` -> ${finalUrl.replace(BASE_URL, '')}` : ''} | Blank: ${isBlank} | Errors: ${consoleErrors.length} | 404s: ${notFoundRequests.length} | Network: ${networkErrors.length}`);
        if (consoleErrors.length > 0) {
          consoleErrors.forEach(e => console.log(`    ERROR: ${e.substring(0, 200)}`));
        }
        if (notFoundRequests.length > 0) {
          notFoundRequests.forEach(u => console.log(`    404: ${u}`));
        }

      } catch (err) {
        console.log(`  [${viewport.label}] FAILED: ${err.message.substring(0, 200)}`);
        findings.push({
          route: route.path,
          name: route.name,
          viewport: viewport.label,
          error: err.message.substring(0, 300),
          severity: 'CRITICAL',
          issue: 'PAGE LOAD FAILED',
        });
      }

      await context.close();
    }
  }

  // Auth flow test
  console.log('\n=== Testing Auth Flow ===');
  const authContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const authPage = await authContext.newPage();
  const authErrors = [];
  authPage.on('console', (msg) => {
    if (msg.type() === 'error') authErrors.push(msg.text());
  });

  try {
    await authPage.goto(`${BASE_URL}/auth`, { waitUntil: 'networkidle', timeout: 15000 });
    await authPage.waitForTimeout(1000);

    // Check for login form elements
    const hasEmailInput = await authPage.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').count() > 0;
    const hasPasswordInput = await authPage.locator('input[type="password"]').count() > 0;
    const hasSubmitButton = await authPage.locator('button[type="submit"], button:has-text("Sign"), button:has-text("Log"), button:has-text("Continue")').count() > 0;
    const hasGoogleAuth = await authPage.locator('button:has-text("Google"), a:has-text("Google"), [data-provider="google"]').count() > 0;
    const hasBetaCode = await authPage.locator('input[placeholder*="beta" i], input[placeholder*="invite" i], input[placeholder*="code" i]').count() > 0;

    await authPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'auth-flow-check.png'), fullPage: true });

    findings.push({
      route: '/auth',
      name: 'auth-flow',
      viewport: 'desktop',
      authElements: {
        emailInput: hasEmailInput,
        passwordInput: hasPasswordInput,
        submitButton: hasSubmitButton,
        googleAuth: hasGoogleAuth,
        betaCodeInput: hasBetaCode,
      },
      consoleErrors: authErrors,
      screenshot: 'auth-flow-check.png',
      issue: (!hasEmailInput && !hasGoogleAuth) ? 'NO AUTH FORM ELEMENTS FOUND' : null,
      severity: (!hasEmailInput && !hasGoogleAuth) ? 'CRITICAL' : null,
    });

    console.log(`  Email input: ${hasEmailInput} | Password: ${hasPasswordInput} | Submit: ${hasSubmitButton} | Google: ${hasGoogleAuth} | Beta code: ${hasBetaCode}`);
  } catch (err) {
    console.log(`  Auth flow FAILED: ${err.message.substring(0, 200)}`);
  }

  await authContext.close();
  await browser.close();

  // Write findings report
  const reportPath = path.join(__dirname, 'audit-findings.json');
  fs.writeFileSync(reportPath, JSON.stringify(findings, null, 2));
  console.log(`\nFindings saved to ${reportPath}`);

  // Summary
  const issues = findings.filter(f => f.issue);
  const critical = issues.filter(f => f.severity === 'CRITICAL');
  const high = issues.filter(f => f.severity === 'HIGH');
  const medium = issues.filter(f => f.severity === 'MEDIUM');
  const low = issues.filter(f => f.severity === 'LOW');

  console.log(`\n========== AUDIT SUMMARY ==========`);
  console.log(`Total routes tested: ${ROUTES.length}`);
  console.log(`Total viewports: ${VIEWPORTS.length}`);
  console.log(`Total checks: ${findings.length}`);
  console.log(`Issues found: ${issues.length}`);
  console.log(`  CRITICAL: ${critical.length}`);
  console.log(`  HIGH: ${high.length}`);
  console.log(`  MEDIUM: ${medium.length}`);
  console.log(`  LOW: ${low.length}`);
  console.log(`===================================\n`);

  if (issues.length > 0) {
    console.log('ISSUES:');
    issues.forEach(f => {
      console.log(`  [${f.severity}] ${f.route} (${f.viewport}): ${f.issue}`);
      if (f.consoleErrors?.length > 0) {
        f.consoleErrors.slice(0, 3).forEach(e => console.log(`    -> ${e.substring(0, 150)}`));
      }
      if (f.notFoundRequests?.length > 0) {
        f.notFoundRequests.slice(0, 3).forEach(u => console.log(`    -> 404: ${u}`));
      }
      if (f.error) {
        console.log(`    -> ${f.error.substring(0, 150)}`);
      }
    });
  }
}

runAudit().catch(console.error);
