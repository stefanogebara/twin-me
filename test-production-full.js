// Comprehensive Production Testing Script
// Tests actual platform connections and functionality
import { chromium } from 'playwright';

const PROD_URL = 'https://twin-ai-learn.vercel.app';
const HEADLESS = false; // Set to false to see the browser

(async () => {
  console.log('🚀 Starting Comprehensive Production Testing\n');
  console.log('📍 Testing URL:', PROD_URL);
  console.log('👁️  Browser Mode:', HEADLESS ? 'Headless' : 'Visible');
  console.log('⏱️  Timeout: 2 minutes per test\n');
  console.log('='.repeat(70) + '\n');

  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: 100 // Slow down actions to see what's happening
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  const results = {
    passed: [],
    failed: [],
    warnings: [],
    platformStatus: {}
  };

  // Capture console messages
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error') {
      console.log(`   ❌ Console Error: ${msg.text()}`);
    } else if (type === 'warning') {
      console.log(`   ⚠️  Console Warning: ${msg.text()}`);
    }
  });

  try {
    // ============================================================
    // PHASE 1: Landing Page & Authentication
    // ============================================================
    console.log('📄 PHASE 1: Landing Page & Authentication');
    console.log('-'.repeat(70));

    await page.goto(PROD_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.screenshot({ path: 'screenshots/prod-landing.png', fullPage: true });

    const title = await page.title();
    console.log(`✓ Page loaded: ${title}`);

    // Check if we're logged in or need to authenticate
    const currentUrl = page.url();
    console.log(`✓ Current URL: ${currentUrl}`);

    // Look for login button or user profile
    const loginButton = await page.$('button:has-text("Sign in"), button:has-text("Login"), a:has-text("Sign in"), a:has-text("Login")');
    const userProfile = await page.$('[data-testid="user-profile"], [class*="profile"], [class*="user-menu"]');

    if (userProfile) {
      console.log('✅ User already logged in');
      results.passed.push('User authentication - Already logged in');
    } else if (loginButton) {
      console.log('⚠️  Login required - User needs to authenticate manually');
      console.log('   Please log in to the platform in the browser window...');
      console.log('   Waiting 60 seconds for manual login...\n');

      // Wait for URL to change (indicating successful login)
      try {
        await page.waitForURL(url => !url.includes('/login') && !url.includes('/signin'), {
          timeout: 60000
        });
        console.log('✅ Login successful!');
        results.passed.push('User authentication - Manual login successful');
      } catch (e) {
        console.log('⚠️  Login timeout - Continuing with public pages only');
        results.warnings.push('User authentication - Timeout waiting for login');
      }
    } else {
      console.log('✓ No login required or already authenticated');
      results.passed.push('User authentication - No auth required');
    }

    await page.screenshot({ path: 'screenshots/prod-after-auth.png', fullPage: true });
    console.log('\n');

    // ============================================================
    // PHASE 2: Navigate to Get Started / Platform Connections
    // ============================================================
    console.log('🔗 PHASE 2: Platform Connections Page');
    console.log('-'.repeat(70));

    await page.goto(`${PROD_URL}/get-started`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.screenshot({ path: 'screenshots/prod-get-started.png', fullPage: true });

    console.log('✓ Navigated to /get-started');

    // Wait a bit for the page to fully render
    await page.waitForTimeout(2000);

    // Check for platform connection cards
    const platformCards = await page.$$('[data-platform], [class*="platform"], [class*="connector"]');
    console.log(`✓ Found ${platformCards.length} platform elements`);

    // Look for specific platform buttons
    const platforms = [
      { name: 'Gmail', searchText: ['Gmail', 'gmail', 'Google Mail'] },
      { name: 'Google Calendar', searchText: ['Calendar', 'calendar', 'Google Calendar'] },
      { name: 'Discord', searchText: ['Discord', 'discord'] },
      { name: 'Reddit', searchText: ['Reddit', 'reddit'] },
      { name: 'Spotify', searchText: ['Spotify', 'spotify'] },
      { name: 'YouTube', searchText: ['YouTube', 'youtube', 'Youtube'] },
      { name: 'Slack', searchText: ['Slack', 'slack'] },
      { name: 'LinkedIn', searchText: ['LinkedIn', 'linkedin', 'Linkedin'] }
    ];

    console.log('\n📊 Platform Connection Status:');
    console.log('-'.repeat(70));

    for (const platform of platforms) {
      // Try to find the platform section
      let platformFound = false;
      let isConnected = false;
      let connectButton = null;

      for (const searchTerm of platform.searchText) {
        // Look for headings or labels with the platform name
        const platformSection = await page.$(`text="${searchTerm}"`);

        if (platformSection) {
          platformFound = true;

          // Check if there's a "Connected" badge nearby
          const connectedBadge = await page.$(`text="Connected" >> near=text="${searchTerm}"`);
          const checkmark = await page.$(`text="✓" >> near=text="${searchTerm}"`);

          if (connectedBadge || checkmark) {
            isConnected = true;
            console.log(`   ✅ ${platform.name}: CONNECTED`);
            results.platformStatus[platform.name] = 'connected';
            results.passed.push(`${platform.name} - Already connected`);
          } else {
            // Look for Connect button
            connectButton = await page.$(`button:has-text("Connect") >> near=text="${searchTerm}"`);

            if (connectButton) {
              console.log(`   🔌 ${platform.name}: NOT CONNECTED (Connect button available)`);
              results.platformStatus[platform.name] = 'disconnected';
              results.warnings.push(`${platform.name} - Not connected`);
            } else {
              console.log(`   ⚠️  ${platform.name}: Status unclear`);
              results.platformStatus[platform.name] = 'unknown';
              results.warnings.push(`${platform.name} - Status unclear`);
            }
          }
          break;
        }
      }

      if (!platformFound) {
        console.log(`   ❌ ${platform.name}: NOT FOUND on page`);
        results.platformStatus[platform.name] = 'not_found';
        results.failed.push(`${platform.name} - Not found on page`);
      }
    }

    console.log('\n');

    // ============================================================
    // PHASE 3: Test Platform Connections (Auto-connect if possible)
    // ============================================================
    console.log('🔌 PHASE 3: Testing Platform Connections');
    console.log('-'.repeat(70));
    console.log('Note: This will attempt to connect platforms that are disconnected');
    console.log('      OAuth flows may require manual intervention\n');

    for (const platform of platforms) {
      if (results.platformStatus[platform.name] === 'disconnected') {
        console.log(`\n🔗 Attempting to connect ${platform.name}...`);

        try {
          // Find and click the Connect button
          const connectButton = await page.$(`button:has-text("Connect") >> near=text="${platform.searchText[0]}"`);

          if (connectButton) {
            await connectButton.click();
            console.log(`   ✓ Clicked Connect button for ${platform.name}`);

            // Wait for potential popup or redirect
            await page.waitForTimeout(3000);

            // Check if we're in an OAuth flow
            const currentUrl = page.url();
            if (currentUrl !== `${PROD_URL}/get-started`) {
              console.log(`   🔄 OAuth flow initiated: ${currentUrl}`);
              console.log(`   ⏳ Waiting for OAuth completion (30 seconds)...`);

              // Wait for return to get-started page
              try {
                await page.waitForURL(`${PROD_URL}/get-started`, { timeout: 30000 });
                console.log(`   ✅ ${platform.name} connection flow completed`);
                results.passed.push(`${platform.name} - Connection attempt successful`);
              } catch (e) {
                console.log(`   ⚠️  ${platform.name} OAuth flow incomplete (may require manual steps)`);
                results.warnings.push(`${platform.name} - OAuth requires manual intervention`);

                // Go back to get-started
                await page.goto(`${PROD_URL}/get-started`, { waitUntil: 'networkidle' });
              }
            } else {
              console.log(`   ⚠️  No redirect occurred - connection may have failed`);
              results.warnings.push(`${platform.name} - No OAuth redirect`);
            }
          }
        } catch (e) {
          console.log(`   ❌ Failed to connect ${platform.name}: ${e.message}`);
          results.failed.push(`${platform.name} - Connection failed: ${e.message}`);
        }
      }
    }

    console.log('\n');

    // ============================================================
    // PHASE 4: Test Soul Signature Dashboard
    // ============================================================
    console.log('📊 PHASE 4: Soul Signature Dashboard');
    console.log('-'.repeat(70));

    await page.goto(`${PROD_URL}/soul-signature`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.screenshot({ path: 'screenshots/prod-soul-signature.png', fullPage: true });

    console.log('✓ Navigated to /soul-signature');

    // Check for dashboard elements
    const dashboardElements = await page.$$('[class*="dashboard"], [class*="stat"], [class*="card"]');
    console.log(`✓ Found ${dashboardElements.length} dashboard elements`);

    // Look for specific dashboard features
    const features = [
      { name: 'Connection Count', selectors: ['text=/\\d+ platform/i', 'text=/\\d+ connected/i'] },
      { name: 'Data Points', selectors: ['text=/\\d+ data points/i', 'text=/data points/i'] },
      { name: 'Soul Signature Progress', selectors: ['text=/soul signature/i', 'text=/progress/i'] },
      { name: 'Recent Activity', selectors: ['text=/recent activity/i', 'text=/activity/i'] }
    ];

    console.log('\n📈 Dashboard Features:');
    for (const feature of features) {
      let found = false;
      for (const selector of feature.selectors) {
        const element = await page.$(selector);
        if (element) {
          const text = await element.textContent();
          console.log(`   ✅ ${feature.name}: "${text.trim()}"`);
          results.passed.push(`Dashboard - ${feature.name} displayed`);
          found = true;
          break;
        }
      }
      if (!found) {
        console.log(`   ⚠️  ${feature.name}: Not found`);
        results.warnings.push(`Dashboard - ${feature.name} missing`);
      }
    }

    console.log('\n');

    // ============================================================
    // PHASE 5: Check API Endpoints
    // ============================================================
    console.log('🌐 PHASE 5: API Endpoints');
    console.log('-'.repeat(70));

    // Monitor network requests
    const apiRequests = [];
    page.on('response', response => {
      if (response.url().includes('/api/')) {
        apiRequests.push({
          url: response.url(),
          status: response.status(),
          method: response.request().method()
        });
      }
    });

    // Refresh the dashboard to trigger API calls
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    console.log(`✓ Captured ${apiRequests.length} API requests:`);
    apiRequests.forEach(req => {
      const status = req.status;
      const emoji = status >= 200 && status < 300 ? '✅' : status >= 400 ? '❌' : '⚠️';
      console.log(`   ${emoji} ${req.method} ${req.status} - ${req.url}`);

      if (status >= 200 && status < 300) {
        results.passed.push(`API - ${req.method} ${new URL(req.url).pathname} (${status})`);
      } else if (status >= 400) {
        results.failed.push(`API - ${req.method} ${new URL(req.url).pathname} (${status})`);
      }
    });

    console.log('\n');

    // ============================================================
    // PHASE 6: Browser Extension Integration Check
    // ============================================================
    console.log('🔧 PHASE 6: Browser Extension Integration');
    console.log('-'.repeat(70));

    // Check if soul observer endpoint is accessible
    const soulObserverTest = await fetch(`${PROD_URL}/api/health`);
    const healthData = await soulObserverTest.json();

    console.log('✓ Health endpoint status:', healthData.status);
    console.log('✓ Database connected:', healthData.database.connected);

    if (healthData.status === 'ok' && healthData.database.connected) {
      results.passed.push('Browser Extension - Backend healthy');
    } else {
      results.failed.push('Browser Extension - Backend not healthy');
    }

    console.log('\n');

    // ============================================================
    // PHASE 7: Final Screenshots
    // ============================================================
    console.log('📸 PHASE 7: Capture Final State');
    console.log('-'.repeat(70));

    await page.goto(`${PROD_URL}/get-started`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'screenshots/prod-final-connections.png', fullPage: true });
    console.log('✓ Screenshot: prod-final-connections.png');

    await page.goto(`${PROD_URL}/soul-signature`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'screenshots/prod-final-dashboard.png', fullPage: true });
    console.log('✓ Screenshot: prod-final-dashboard.png');

    console.log('\n');

  } catch (error) {
    console.error('❌ Test execution error:', error.message);
    results.failed.push(`Test execution error: ${error.message}`);
  } finally {
    // Keep browser open for manual inspection if not headless
    if (!HEADLESS) {
      console.log('\n⏸️  Browser will remain open for manual inspection...');
      console.log('   Press Enter to close and generate report...');

      // Wait for user input (only works if running interactively)
      await new Promise(resolve => {
        process.stdin.once('data', () => resolve());
      });
    }

    await browser.close();
  }

  // ============================================================
  // FINAL REPORT
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('📊 COMPREHENSIVE TEST RESULTS');
  console.log('='.repeat(70));

  console.log(`\n✅ PASSED (${results.passed.length}):`);
  results.passed.forEach(p => console.log(`   ✓ ${p}`));

  console.log(`\n⚠️  WARNINGS (${results.warnings.length}):`);
  results.warnings.forEach(w => console.log(`   ⚠ ${w}`));

  console.log(`\n❌ FAILED (${results.failed.length}):`);
  results.failed.forEach(f => console.log(`   ✗ ${f}`));

  console.log('\n' + '='.repeat(70));
  console.log('🔌 PLATFORM CONNECTION STATUS');
  console.log('='.repeat(70));

  Object.entries(results.platformStatus).forEach(([platform, status]) => {
    const emoji = status === 'connected' ? '✅' :
                  status === 'disconnected' ? '🔌' :
                  status === 'not_found' ? '❌' : '⚠️';
    console.log(`${emoji} ${platform}: ${status.toUpperCase()}`);
  });

  const passRate = ((results.passed.length / (results.passed.length + results.failed.length)) * 100).toFixed(1);
  console.log('\n' + '='.repeat(70));
  console.log(`🎯 Overall Pass Rate: ${passRate}%`);
  console.log(`📸 Screenshots saved in screenshots/ directory`);
  console.log('='.repeat(70));

  console.log('\n✅ Production Testing Complete!\n');

  process.exit(results.failed.length > 0 ? 1 : 0);
})();
