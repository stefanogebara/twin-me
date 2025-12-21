/**
 * Token Refresh Service - Manual Testing Script
 *
 * This script helps you test the token refresh service manually.
 * Run with: node api/services/tokenRefreshService.test.js
 *
 * Prerequisites:
 * 1. Have a user with at least one connected platform (Spotify, Discord, or YouTube)
 * 2. Set up all environment variables in .env
 * 3. Ensure ENCRYPTION_KEY is set
 */

import dotenv from 'dotenv';
import { refreshPlatformToken, getValidAccessToken, refreshExpiringTokens } from './tokenRefreshService.js';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

// Test configuration
const TEST_CONFIG = {
  // Replace with your test user ID from Supabase
  userId: 'YOUR_TEST_USER_ID_HERE',

  // Platforms to test
  platforms: ['spotify', 'discord', 'youtube', 'google_gmail'],

  // Test scenarios
  scenarios: {
    validToken: true,
    expiringToken: true,
    bulkRefresh: true,
    errorHandling: true
  }
};

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bright');
  console.log('='.repeat(80));
}

function subsection(title) {
  console.log('\n' + '-'.repeat(80));
  log(title, 'cyan');
  console.log('-'.repeat(80));
}

/**
 * Check environment variables
 */
async function checkEnvironment() {
  section('1. ENVIRONMENT VALIDATION');

  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ENCRYPTION_KEY',
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET'
  ];

  let allPresent = true;

  for (const varName of requiredVars) {
    const isPresent = !!process.env[varName];
    const status = isPresent ? '✅' : '❌';
    const color = isPresent ? 'green' : 'red';

    log(`${status} ${varName}: ${isPresent ? 'SET' : 'MISSING'}`, color);

    if (!isPresent) allPresent = false;
  }

  if (!allPresent) {
    log('\n❌ Missing required environment variables. Please check your .env file.', 'red');
    process.exit(1);
  }

  log('\n✅ All environment variables present', 'green');
}

/**
 * Check database connection and user's platforms
 */
async function checkDatabaseConnection() {
  section('2. DATABASE CONNECTION');

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    log('Connecting to Supabase...', 'cyan');

    const { data, error } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('user_id', TEST_CONFIG.userId);

    if (error) {
      throw error;
    }

    log('✅ Database connection successful', 'green');
    log(`\nFound ${data.length} platform connection(s) for test user:`, 'cyan');

    if (data.length === 0) {
      log('\n⚠️  No platform connections found for test user', 'yellow');
      log('Please connect at least one platform (Spotify, Discord, or YouTube)', 'yellow');
      log(`User ID: ${TEST_CONFIG.userId}`, 'yellow');
      process.exit(1);
    }

    for (const conn of data) {
      const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
      const now = new Date();
      const isExpired = expiresAt && expiresAt <= now;
      const timeUntilExpiry = expiresAt ? Math.round((expiresAt - now) / 1000 / 60) : null;

      console.log(`\n  Platform: ${conn.platform}`);
      console.log(`  Status: ${conn.status}`);
      console.log(`  Has access token: ${!!conn.access_token}`);
      console.log(`  Has refresh token: ${!!conn.refresh_token}`);
      console.log(`  Expires at: ${conn.token_expires_at || 'N/A'}`);

      if (timeUntilExpiry !== null) {
        if (isExpired) {
          log(`  ⚠️  Token EXPIRED`, 'red');
        } else if (timeUntilExpiry < 5) {
          log(`  ⚠️  Token expiring in ${timeUntilExpiry} minutes`, 'yellow');
        } else {
          log(`  ✅ Token valid for ${timeUntilExpiry} minutes`, 'green');
        }
      }
    }

    return data;

  } catch (error) {
    log(`\n❌ Database connection failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

/**
 * Test 1: Get valid access token
 */
async function testGetValidAccessToken(platform) {
  subsection(`Test 1: Get Valid Access Token - ${platform}`);

  try {
    log('Calling getValidAccessToken()...', 'cyan');
    const startTime = Date.now();

    const token = await getValidAccessToken(TEST_CONFIG.userId, platform);

    const duration = Date.now() - startTime;

    if (token) {
      log(`✅ SUCCESS: Got valid token in ${duration}ms`, 'green');
      log(`Token length: ${token.length} characters`, 'cyan');
      log(`Token preview: ${token.substring(0, 20)}...`, 'cyan');
      return { success: true, token, duration };
    } else {
      log('❌ FAILED: No token returned', 'red');
      log('Possible reasons:', 'yellow');
      log('  - Platform not connected', 'yellow');
      log('  - Refresh token invalid', 'yellow');
      log('  - OAuth credentials incorrect', 'yellow');
      return { success: false, error: 'No token returned' };
    }

  } catch (error) {
    log(`❌ ERROR: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

/**
 * Test 2: Manual token refresh
 */
async function testManualTokenRefresh(platform) {
  subsection(`Test 2: Manual Token Refresh - ${platform}`);

  try {
    log('Calling refreshPlatformToken()...', 'cyan');
    const startTime = Date.now();

    const result = await refreshPlatformToken(TEST_CONFIG.userId, platform);

    const duration = Date.now() - startTime;

    if (result) {
      log(`✅ SUCCESS: Token refreshed in ${duration}ms`, 'green');
      log(`Access token length: ${result.accessToken.length}`, 'cyan');
      log(`Refresh token length: ${result.refreshToken.length}`, 'cyan');
      log(`Expires in: ${result.expiresIn} seconds (${Math.round(result.expiresIn / 60)} minutes)`, 'cyan');
      return { success: true, result, duration };
    } else {
      log('⚠️  No result returned (may be expected for some platforms)', 'yellow');
      return { success: false, reason: 'No result' };
    }

  } catch (error) {
    log(`❌ ERROR: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

/**
 * Test 3: Bulk token refresh
 */
async function testBulkTokenRefresh() {
  subsection('Test 3: Bulk Token Refresh (All Platforms)');

  try {
    log('Calling refreshExpiringTokens()...', 'cyan');
    const startTime = Date.now();

    const results = await refreshExpiringTokens();

    const duration = Date.now() - startTime;

    log(`\n✅ Bulk refresh completed in ${duration}ms`, 'green');
    log(`Tokens checked: ${results.checked}`, 'cyan');
    log(`Tokens refreshed: ${results.refreshed}`, results.refreshed > 0 ? 'green' : 'cyan');
    log(`Tokens failed: ${results.failed}`, results.failed > 0 ? 'red' : 'cyan');

    return { success: true, results, duration };

  } catch (error) {
    log(`❌ ERROR: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

/**
 * Test 4: Error handling
 */
async function testErrorHandling() {
  subsection('Test 4: Error Handling');

  const tests = [
    {
      name: 'Invalid user ID',
      test: async () => {
        const token = await getValidAccessToken('invalid-user-id', 'spotify');
        return token === null;
      }
    },
    {
      name: 'Invalid platform',
      test: async () => {
        const token = await getValidAccessToken(TEST_CONFIG.userId, 'nonexistent-platform');
        return token === null;
      }
    },
    {
      name: 'GitHub (no refresh needed)',
      test: async () => {
        const result = await refreshPlatformToken(TEST_CONFIG.userId, 'github');
        return result === null; // Expected for GitHub
      }
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const { name, test } of tests) {
    try {
      log(`\nTesting: ${name}`, 'cyan');
      const result = await test();

      if (result) {
        log(`  ✅ PASSED`, 'green');
        passed++;
      } else {
        log(`  ❌ FAILED`, 'red');
        failed++;
      }
    } catch (error) {
      log(`  ❌ ERROR: ${error.message}`, 'red');
      failed++;
    }
  }

  log(`\nError handling tests: ${passed}/${tests.length} passed`, passed === tests.length ? 'green' : 'yellow');
  return { passed, failed, total: tests.length };
}

/**
 * Performance benchmarks
 */
async function runPerformanceBenchmarks(connections) {
  section('3. PERFORMANCE BENCHMARKS');

  const benchmarks = [];

  for (const conn of connections) {
    log(`\nBenchmarking ${conn.platform}...`, 'cyan');

    // Benchmark getValidAccessToken
    const iterations = 5;
    const durations = [];

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await getValidAccessToken(TEST_CONFIG.userId, conn.platform);
      durations.push(Date.now() - start);
    }

    const avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / iterations);
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);

    benchmarks.push({
      platform: conn.platform,
      avgDuration,
      minDuration,
      maxDuration
    });

    log(`  Average: ${avgDuration}ms`, 'cyan');
    log(`  Min: ${minDuration}ms`, 'green');
    log(`  Max: ${maxDuration}ms`, 'yellow');
  }

  return benchmarks;
}

/**
 * Generate test report
 */
function generateReport(testResults) {
  section('4. TEST SUMMARY');

  const { getValidToken, manualRefresh, bulkRefresh, errorHandling, performance } = testResults;

  console.log('\n📊 Test Results:');
  console.log('─'.repeat(80));

  // Get Valid Token Results
  if (getValidToken && getValidToken.length > 0) {
    const successCount = getValidToken.filter(r => r.success).length;
    const avgDuration = Math.round(
      getValidToken.reduce((acc, r) => acc + (r.duration || 0), 0) / getValidToken.length
    );

    log(`\n✓ Get Valid Token: ${successCount}/${getValidToken.length} succeeded`, successCount === getValidToken.length ? 'green' : 'yellow');
    log(`  Average duration: ${avgDuration}ms`, 'cyan');
  }

  // Manual Refresh Results
  if (manualRefresh && manualRefresh.length > 0) {
    const successCount = manualRefresh.filter(r => r.success).length;
    const avgDuration = Math.round(
      manualRefresh.filter(r => r.duration).reduce((acc, r) => acc + r.duration, 0) /
      manualRefresh.filter(r => r.duration).length || 1
    );

    log(`\n✓ Manual Refresh: ${successCount}/${manualRefresh.length} succeeded`, successCount > 0 ? 'green' : 'yellow');
    if (avgDuration > 0) {
      log(`  Average duration: ${avgDuration}ms`, 'cyan');
    }
  }

  // Bulk Refresh Results
  if (bulkRefresh && bulkRefresh.success) {
    log(`\n✓ Bulk Refresh: SUCCESS`, 'green');
    log(`  Checked: ${bulkRefresh.results.checked}`, 'cyan');
    log(`  Refreshed: ${bulkRefresh.results.refreshed}`, 'cyan');
    log(`  Failed: ${bulkRefresh.results.failed}`, 'cyan');
    log(`  Duration: ${bulkRefresh.duration}ms`, 'cyan');
  }

  // Error Handling Results
  if (errorHandling) {
    log(`\n✓ Error Handling: ${errorHandling.passed}/${errorHandling.total} passed`,
      errorHandling.passed === errorHandling.total ? 'green' : 'yellow');
  }

  // Performance Benchmarks
  if (performance && performance.length > 0) {
    log(`\n📈 Performance Benchmarks:`, 'bright');
    for (const bench of performance) {
      console.log(`  ${bench.platform}: ${bench.avgDuration}ms avg (${bench.minDuration}-${bench.maxDuration}ms)`);
    }
  }

  console.log('\n' + '─'.repeat(80));
  log('\n✅ Testing complete!', 'green');
  log('\nNext steps:', 'cyan');
  log('1. Review any failed tests above', 'cyan');
  log('2. Check server logs for detailed error messages', 'cyan');
  log('3. Verify OAuth credentials in .env file', 'cyan');
  log('4. Test with real API calls to platforms', 'cyan');
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('\n' + '='.repeat(80));
  log('TOKEN REFRESH SERVICE - MANUAL TESTING SUITE', 'bright');
  log('Soul Signature Platform', 'magenta');
  console.log('='.repeat(80));

  if (TEST_CONFIG.userId === 'YOUR_TEST_USER_ID_HERE') {
    log('\n❌ ERROR: Please set TEST_CONFIG.userId in tokenRefreshService.test.js', 'red');
    log('Find your user ID in Supabase and update the TEST_CONFIG object', 'yellow');
    process.exit(1);
  }

  const testResults = {
    getValidToken: [],
    manualRefresh: [],
    bulkRefresh: null,
    errorHandling: null,
    performance: []
  };

  try {
    // Step 1: Check environment
    await checkEnvironment();

    // Step 2: Check database connection
    const connections = await checkDatabaseConnection();

    // Step 3: Run performance benchmarks
    if (TEST_CONFIG.scenarios.validToken) {
      testResults.performance = await runPerformanceBenchmarks(connections);
    }

    // Run tests for each platform
    section('4. PLATFORM-SPECIFIC TESTS');

    for (const conn of connections) {
      // Test 1: Get Valid Access Token
      if (TEST_CONFIG.scenarios.validToken) {
        const result = await testGetValidAccessToken(conn.platform);
        testResults.getValidToken.push({ platform: conn.platform, ...result });
      }

      // Test 2: Manual Token Refresh
      if (TEST_CONFIG.scenarios.expiringToken) {
        const result = await testManualTokenRefresh(conn.platform);
        testResults.manualRefresh.push({ platform: conn.platform, ...result });
      }

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Test 3: Bulk Refresh
    if (TEST_CONFIG.scenarios.bulkRefresh) {
      testResults.bulkRefresh = await testBulkTokenRefresh();
    }

    // Test 4: Error Handling
    if (TEST_CONFIG.scenarios.errorHandling) {
      testResults.errorHandling = await testErrorHandling();
    }

    // Generate final report
    generateReport(testResults);

  } catch (error) {
    log(`\n❌ Fatal error during testing: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export default runTests;
