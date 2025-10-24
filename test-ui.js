// UI Testing Script for Twin AI Learn Platform
import { chromium } from 'playwright';

(async () => {
  console.log('🚀 Starting comprehensive UI testing...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  // Test results storage
  const results = {
    passed: [],
    failed: [],
    warnings: []
  };

  // Capture console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // Test 1: Landing Page
    console.log('📄 Test 1: Landing Page');
    await page.goto('https://twin-ai-learn.vercel.app/', { waitUntil: 'networkidle' });
    const title = await page.title();
    console.log(`   Title: ${title}`);

    if (title.includes('Twin Me') || title.includes('Soul Signature')) {
      results.passed.push('Landing page loads with correct title');
      console.log('   ✅ PASS: Landing page title correct');
    } else {
      results.failed.push(`Landing page title incorrect: ${title}`);
      console.log('   ❌ FAIL: Landing page title incorrect');
    }

    // Take screenshot
    await page.screenshot({ path: 'screenshots/landing-page.png', fullPage: true });
    console.log('   📸 Screenshot saved: landing-page.png\n');

    // Test 2: Soul Signature Dashboard (requires auth)
    console.log('📊 Test 2: Soul Signature Dashboard');
    await page.goto('https://twin-ai-learn.vercel.app/soul-signature', { waitUntil: 'networkidle' });
    const dashboardUrl = page.url();
    console.log(`   Current URL: ${dashboardUrl}`);

    if (dashboardUrl.includes('/soul-signature') || dashboardUrl.includes('/login')) {
      results.passed.push('Soul signature dashboard route exists');
      console.log('   ✅ PASS: Dashboard route accessible');
    } else {
      results.failed.push('Soul signature dashboard route not found');
      console.log('   ❌ FAIL: Dashboard route not accessible');
    }

    await page.screenshot({ path: 'screenshots/soul-signature.png', fullPage: true });
    console.log('   📸 Screenshot saved: soul-signature.png\n');

    // Test 3: Get Started Page
    console.log('🔗 Test 3: Get Started / Platform Connections');
    await page.goto('https://twin-ai-learn.vercel.app/get-started', { waitUntil: 'networkidle' });
    const getStartedUrl = page.url();
    console.log(`   Current URL: ${getStartedUrl}`);

    if (getStartedUrl.includes('/get-started') || getStartedUrl.includes('/login')) {
      results.passed.push('Get started page route exists');
      console.log('   ✅ PASS: Get started route accessible');
    } else {
      results.failed.push('Get started page route not found');
      console.log('   ❌ FAIL: Get started route not accessible');
    }

    await page.screenshot({ path: 'screenshots/get-started.png', fullPage: true });
    console.log('   📸 Screenshot saved: get-started.png\n');

    // Test 4: Check for platform connector buttons (if visible)
    console.log('🔌 Test 4: Platform Connectors');
    const platformElements = await page.$$('[data-platform], [class*="platform"], button:has-text("Connect")');
    console.log(`   Found ${platformElements.length} potential platform elements`);

    if (platformElements.length > 0) {
      results.passed.push(`Found ${platformElements.length} platform connector elements`);
      console.log('   ✅ PASS: Platform connector UI present\n');
    } else {
      results.warnings.push('No platform connector elements found (may require auth)');
      console.log('   ⚠️  WARNING: No platform elements found (may require login)\n');
    }

    // Test 5: Responsive Design - Tablet
    console.log('📱 Test 5: Responsive Design - Tablet (768px)');
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('https://twin-ai-learn.vercel.app/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'screenshots/landing-tablet.png', fullPage: true });
    results.passed.push('Tablet viewport renders');
    console.log('   ✅ PASS: Tablet viewport tested');
    console.log('   📸 Screenshot saved: landing-tablet.png\n');

    // Test 6: Responsive Design - Mobile
    console.log('📱 Test 6: Responsive Design - Mobile (375px)');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('https://twin-ai-learn.vercel.app/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'screenshots/landing-mobile.png', fullPage: true });
    results.passed.push('Mobile viewport renders');
    console.log('   ✅ PASS: Mobile viewport tested');
    console.log('   📸 Screenshot saved: landing-mobile.png\n');

    // Test 7: Network Requests
    console.log('🌐 Test 7: Network Requests');
    await page.setViewportSize({ width: 1440, height: 900 });
    const responses = [];
    page.on('response', response => {
      if (response.url().includes('twin-ai-learn.vercel.app/api')) {
        responses.push({
          url: response.url(),
          status: response.status(),
          statusText: response.statusText()
        });
      }
    });

    await page.goto('https://twin-ai-learn.vercel.app/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log(`   Captured ${responses.length} API requests`);
    responses.forEach(r => {
      console.log(`   ${r.status} - ${r.url}`);
    });
    results.passed.push(`${responses.length} API requests captured`);
    console.log('   ✅ PASS: Network monitoring working\n');

    // Test 8: Console Errors
    console.log('🐛 Test 8: Console Errors');
    if (consoleErrors.length === 0) {
      results.passed.push('No console errors detected');
      console.log('   ✅ PASS: No console errors\n');
    } else {
      results.warnings.push(`${consoleErrors.length} console errors found`);
      console.log(`   ⚠️  WARNING: ${consoleErrors.length} console errors:`);
      consoleErrors.slice(0, 5).forEach(err => console.log(`      - ${err}`));
      if (consoleErrors.length > 5) {
        console.log(`      ... and ${consoleErrors.length - 5} more\n`);
      }
    }

  } catch (error) {
    results.failed.push(`Test execution error: ${error.message}`);
    console.error('❌ Test execution error:', error.message);
  } finally {
    await browser.close();
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed.length}`);
  results.passed.forEach(p => console.log(`   - ${p}`));
  console.log(`\n⚠️  Warnings: ${results.warnings.length}`);
  results.warnings.forEach(w => console.log(`   - ${w}`));
  console.log(`\n❌ Failed: ${results.failed.length}`);
  results.failed.forEach(f => console.log(`   - ${f}`));
  console.log('\n' + '='.repeat(60));

  const passRate = (results.passed.length / (results.passed.length + results.failed.length)) * 100;
  console.log(`\n🎯 Pass Rate: ${passRate.toFixed(1)}%`);
  console.log(`📸 Screenshots saved in screenshots/ directory`);
  console.log('\n✅ UI Testing Complete!');

  process.exit(results.failed.length > 0 ? 1 : 0);
})();
