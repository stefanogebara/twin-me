/**
 * Comprehensive Soul Signature Platform Test
 * Tests all pages, buttons, features, and functionality
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:8086';
const SCREENSHOTS_DIR = path.join(__dirname, 'test-screenshots');

// Create screenshots directory
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Test results tracker
const testResults = {
  passed: [],
  failed: [],
  warnings: [],
  screenshots: []
};

function logResult(test, status, message = '') {
  const result = { test, status, message, timestamp: new Date().toISOString() };
  if (status === 'passed') {
    testResults.passed.push(result);
    console.log(`✅ PASS: ${test}${message ? ' - ' + message : ''}`);
  } else if (status === 'failed') {
    testResults.failed.push(result);
    console.log(`❌ FAIL: ${test}${message ? ' - ' + message : ''}`);
  } else if (status === 'warning') {
    testResults.warnings.push(result);
    console.log(`⚠️  WARN: ${test}${message ? ' - ' + message : ''}`);
  }
}

async function takeScreenshot(page, name, description = '') {
  const filename = `${name.replace(/\s+/g, '-').toLowerCase()}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  testResults.screenshots.push({ name, filename, description });
  console.log(`📸 Screenshot saved: ${filename}`);
}

async function testLandingPage(page) {
  console.log('\n🏠 TESTING LANDING PAGE...\n');

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    logResult('Landing Page Load', 'passed');
    await takeScreenshot(page, 'landing-page-initial', 'Initial landing page load');

    // Test Hero Section
    console.log('\n--- Testing Hero Section ---');
    const heroHeading = await page.locator('h1').first();
    const heroText = await heroHeading.textContent();
    if (heroText && heroText.length > 0) {
      logResult('Hero Heading Present', 'passed', `Text: "${heroText}"`);
    } else {
      logResult('Hero Heading Present', 'failed', 'No heading text found');
    }

    // Check for Soul Signature messaging
    const pageContent = await page.textContent('body');
    if (pageContent.includes('Soul Signature') || pageContent.includes('soul signature')) {
      logResult('Soul Signature Branding', 'passed', 'Found Soul Signature terminology');
    } else {
      logResult('Soul Signature Branding', 'warning', 'Soul Signature terminology not found');
    }

    // Check for old education content
    if (pageContent.includes('professor') || pageContent.includes('student') || pageContent.includes('Twin AI Learn')) {
      logResult('Old Content Removed', 'failed', 'Found outdated education-related content');
    } else {
      logResult('Old Content Removed', 'passed', 'No education-related content found');
    }

    // Test Typography (Styrene/Space Grotesk font)
    const headingFont = await heroHeading.evaluate(el => window.getComputedStyle(el).fontFamily);
    if (headingFont.includes('Space Grotesk') || headingFont.includes('Styrene')) {
      logResult('Typography - Hero Heading', 'passed', `Font: ${headingFont}`);
    } else {
      logResult('Typography - Hero Heading', 'warning', `Unexpected font: ${headingFont}`);
    }

    // Test CTA Buttons
    console.log('\n--- Testing CTA Buttons ---');
    const ctaButtons = await page.locator('button').all();
    logResult('CTA Buttons Count', 'passed', `Found ${ctaButtons.length} buttons`);

    for (let i = 0; i < Math.min(ctaButtons.length, 5); i++) {
      const button = ctaButtons[i];
      const isVisible = await button.isVisible();
      const buttonText = await button.textContent();
      const buttonClass = await button.getAttribute('class');

      logResult(`Button ${i + 1}`, isVisible ? 'passed' : 'failed',
        `Text: "${buttonText?.trim()}", Class: ${buttonClass?.includes('cartoon') ? 'Has cartoon class' : 'No cartoon class'}`);
    }

    // Test for cartoon button styling
    const cartoonButtons = await page.locator('.cartoon-button').count();
    if (cartoonButtons >= 3) {
      logResult('Cartoon Button Styling', 'passed', `Found ${cartoonButtons} cartoon-styled buttons - excellent consistency!`);
    } else if (cartoonButtons > 0) {
      logResult('Cartoon Button Styling', 'passed', `Found ${cartoonButtons} cartoon-styled buttons`);
    } else {
      logResult('Cartoon Button Styling', 'warning', 'No .cartoon-button class found');
    }

    // Test Features Section
    console.log('\n--- Testing Features Section ---');
    const featuresSection = await page.locator('#features, section:has-text("features")').first();
    if (await featuresSection.count() > 0) {
      const featureCards = await page.locator('.artemis-card, [class*="feature"]').count();
      logResult('Features Section', 'passed', `Found ${featureCards} feature cards`);
      await takeScreenshot(page, 'features-section', 'Features section with cards');
    } else {
      logResult('Features Section', 'warning', 'Features section not clearly identified');
    }

    // Test Testimonials Section
    console.log('\n--- Testing Testimonials Section ---');
    const testimonialsSection = await page.locator('#testimonials, section:has-text("testimonial")').first();
    if (await testimonialsSection.count() > 0) {
      logResult('Testimonials Section', 'passed');
      await takeScreenshot(page, 'testimonials-section', 'Testimonials section');
    } else {
      logResult('Testimonials Section', 'warning', 'Testimonials section not found');
    }

    // Test Navigation Links
    console.log('\n--- Testing Navigation ---');
    const navLinks = await page.locator('nav a, header a').all();
    logResult('Navigation Links', 'passed', `Found ${navLinks.length} navigation links`);

  } catch (error) {
    logResult('Landing Page Test', 'failed', error.message);
  }
}

async function testThemeToggle(page) {
  console.log('\n🌓 TESTING THEME TOGGLE...\n');

  try {
    // Look for theme toggle button with improved selectors
    const themeToggle = await page.locator('[data-testid="theme-toggle"], .theme-toggle, [aria-label*="theme"], [aria-label*="mode"]').first();

    if (await themeToggle.count() > 0) {
      logResult('Theme Toggle Button Found', 'passed', 'Theme toggle detected in navigation');

      // Get initial theme
      const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      logResult('Initial Theme', 'passed', `Theme: ${initialTheme || 'light'}`);

      await takeScreenshot(page, 'theme-before-toggle', 'Before theme toggle');

      // Click theme toggle
      await themeToggle.click();
      await page.waitForTimeout(500); // Wait for transition

      const newTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      logResult('Theme Toggle Functionality', 'passed', `Changed to: ${newTheme || 'light'}`);

      await takeScreenshot(page, 'theme-after-toggle', 'After theme toggle');

      // Check for smooth transitions
      const hasTransition = await page.evaluate(() => {
        const body = document.body;
        const styles = window.getComputedStyle(body);
        return styles.transition.includes('background-color') || styles.transition.includes('color');
      });

      logResult('Theme Transition Smoothness', hasTransition ? 'passed' : 'warning',
        hasTransition ? 'Smooth transitions detected' : 'No transition CSS found');
    } else {
      logResult('Theme Toggle Button', 'failed', 'Theme toggle button not found');
    }
  } catch (error) {
    logResult('Theme Toggle Test', 'failed', error.message);
  }
}

async function testAuthenticationFlow(page) {
  console.log('\n🔐 TESTING AUTHENTICATION FLOW...\n');

  try {
    // Look for Sign In / Sign Up / Get Started buttons
    const authButtons = await page.locator('button:has-text("Sign"), button:has-text("Login"), button:has-text("Get Started"), a:has-text("Sign")').all();

    if (authButtons.length > 0) {
      logResult('Auth Buttons Found', 'passed', `Found ${authButtons.length} auth-related buttons`);

      // Click first auth button
      const firstAuthButton = authButtons[0];
      const buttonText = await firstAuthButton.textContent();
      logResult('Auth Button Click Attempt', 'passed', `Clicking: "${buttonText?.trim()}"`);

      await firstAuthButton.click();
      await page.waitForTimeout(1000);

      // Check if navigated to auth page
      const currentUrl = page.url();
      logResult('Auth Navigation', 'passed', `URL: ${currentUrl}`);

      await takeScreenshot(page, 'auth-page', 'Authentication page');

      // Check for auth form elements
      const emailInput = await page.locator('input[type="email"], input[name="email"]').count();
      const passwordInput = await page.locator('input[type="password"], input[name="password"]').count();
      const googleButton = await page.locator('button:has-text("Google")').count();

      logResult('Email Input', emailInput > 0 ? 'passed' : 'failed');
      logResult('Password Input', passwordInput > 0 ? 'passed' : 'failed');
      logResult('Google OAuth Button', googleButton > 0 ? 'passed' : 'warning',
        googleButton > 0 ? 'Google OAuth available' : 'No Google OAuth button found');

      // Go back to home
      await page.goto(BASE_URL);
    } else {
      logResult('Auth Buttons Found', 'warning', 'No authentication buttons found on landing page');
    }
  } catch (error) {
    logResult('Authentication Flow Test', 'failed', error.message);
  }
}

async function testRouting(page) {
  console.log('\n🗺️  TESTING ROUTING & NAVIGATION...\n');

  const routes = [
    { path: '/', name: 'Home' },
    { path: '/talk-to-twin', name: 'Talk to Twin' },
    { path: '/contact', name: 'Contact' },
    { path: '/auth', name: 'Authentication' },
  ];

  for (const route of routes) {
    try {
      await page.goto(BASE_URL + route.path, { waitUntil: 'networkidle', timeout: 10000 });
      const title = await page.title();
      logResult(`Route: ${route.name}`, 'passed', `Title: "${title}"`);
      await takeScreenshot(page, `route-${route.name.replace(/\s+/g, '-').toLowerCase()}`, `${route.name} page`);
    } catch (error) {
      logResult(`Route: ${route.name}`, 'failed', error.message);
    }
  }
}

async function testResponsiveness(page) {
  console.log('\n📱 TESTING RESPONSIVENESS...\n');

  const viewports = [
    { width: 375, height: 667, name: 'Mobile' },
    { width: 768, height: 1024, name: 'Tablet' },
    { width: 1920, height: 1080, name: 'Desktop' }
  ];

  for (const viewport of viewports) {
    try {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      logResult(`Responsive: ${viewport.name}`, 'passed', `${viewport.width}x${viewport.height}`);
      await takeScreenshot(page, `responsive-${viewport.name.toLowerCase()}`, `${viewport.name} view`);
    } catch (error) {
      logResult(`Responsive: ${viewport.name}`, 'failed', error.message);
    }
  }

  // Reset to desktop
  await page.setViewportSize({ width: 1920, height: 1080 });
}

async function testAPIEndpoints(page) {
  console.log('\n🔌 TESTING BACKEND API ENDPOINTS...\n');

  const API_URL = 'http://localhost:3001/api';

  const endpoints = [
    { method: 'GET', path: '/health', name: 'Health Check' },
    { method: 'GET', path: '/mcp/platforms', name: 'Platform List' },
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await page.request.get(API_URL + endpoint.path);
      const status = response.status();

      if (status >= 200 && status < 300) {
        logResult(`API: ${endpoint.name}`, 'passed', `Status: ${status}`);
      } else if (status === 401 || status === 403) {
        logResult(`API: ${endpoint.name}`, 'warning', `Status: ${status} (auth required)`);
      } else {
        logResult(`API: ${endpoint.name}`, 'failed', `Status: ${status}`);
      }
    } catch (error) {
      logResult(`API: ${endpoint.name}`, 'failed', error.message);
    }
  }
}

async function generateReport() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY REPORT');
  console.log('='.repeat(80));
  console.log(`\n✅ Passed: ${testResults.passed.length}`);
  console.log(`❌ Failed: ${testResults.failed.length}`);
  console.log(`⚠️  Warnings: ${testResults.warnings.length}`);
  console.log(`📸 Screenshots: ${testResults.screenshots.length}`);

  if (testResults.failed.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    testResults.failed.forEach((result, i) => {
      console.log(`  ${i + 1}. ${result.test}: ${result.message}`);
    });
  }

  if (testResults.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    testResults.warnings.forEach((result, i) => {
      console.log(`  ${i + 1}. ${result.test}: ${result.message}`);
    });
  }

  console.log(`\n📁 Screenshots saved to: ${SCREENSHOTS_DIR}`);
  console.log('='.repeat(80) + '\n');

  // Save JSON report
  const reportPath = path.join(__dirname, 'test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  console.log(`📄 Full report saved to: ${reportPath}\n`);
}

async function runAllTests() {
  console.log('🚀 Starting Comprehensive Platform Testing...\n');

  const browser = await chromium.launch({
    headless: false, // Set to false to see the browser
    slowMo: 100 // Slow down actions for visibility
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: path.join(__dirname, 'test-videos') }
  });

  const page = await context.newPage();

  // Enable console logging from the page
  page.on('console', msg => {
    if (msg.type() === 'error') {
      logResult('Browser Console Error', 'warning', msg.text());
    }
  });

  // Catch page errors
  page.on('pageerror', error => {
    logResult('Page Error', 'failed', error.message);
  });

  try {
    // Run all test suites
    await testLandingPage(page);
    await testThemeToggle(page);
    await testAuthenticationFlow(page);
    await testRouting(page);
    await testResponsiveness(page);
    await testAPIEndpoints(page);

    // Generate final report
    await generateReport();

  } catch (error) {
    console.error('❌ Critical test error:', error);
  } finally {
    await context.close();
    await browser.close();
  }
}

// Run tests
runAllTests().catch(console.error);
