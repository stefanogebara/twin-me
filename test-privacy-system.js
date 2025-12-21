/**
 * Privacy System Test Script
 *
 * Comprehensive test of the privacy control system.
 * Tests all API endpoints and data filtering functionality.
 */

const API_BASE = 'http://localhost:3001';
let authToken = '';
let userId = '';

// Color output helpers
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✓ ${message}`, 'green');
}

function error(message) {
  log(`✗ ${message}`, 'red');
}

function info(message) {
  log(`ℹ ${message}`, 'blue');
}

function section(message) {
  log(`\n${'='.repeat(60)}`, 'yellow');
  log(message, 'yellow');
  log('='.repeat(60), 'yellow');
}

// API request helper
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
    ...options.headers
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Request failed');
    }

    return { success: true, data, status: response.status };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Test 1: Authentication
async function testAuthentication() {
  section('Test 1: Authentication');

  // Try to register or login
  info('Attempting to create test user...');

  const testUser = {
    email: `test-${Date.now()}@twinailearn.com`,
    password: 'TestPassword123!',
    name: 'Privacy Test User'
  };

  let result = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(testUser)
  });

  if (!result.success) {
    info('Registration failed, trying login with existing user...');
    // Try login with demo credentials
    result = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'demo@twinailearn.com',
        password: 'demo123'
      })
    });
  }

  if (result.success && result.data.token) {
    authToken = result.data.token;
    userId = result.data.user.id;
    success(`Authenticated as user: ${userId}`);
    return true;
  } else {
    error(`Authentication failed: ${result.error}`);
    info('Please ensure the server is running and you have valid credentials');
    return false;
  }
}

// Test 2: Get Privacy Profile
async function testGetPrivacyProfile() {
  section('Test 2: Get Privacy Profile');

  const result = await apiRequest(`/api/privacy-controls/profile/${userId}`);

  if (result.success) {
    const profile = result.data.profile;
    success('Privacy profile retrieved');
    info(`  Global privacy: ${profile.global_privacy}%`);
    info(`  Total clusters: ${profile.clusters.length}`);
    info(`  Selected audience: ${profile.selected_audience_id}`);
    return profile;
  } else {
    error(`Failed to get profile: ${result.error}`);
    return null;
  }
}

// Test 3: Update Global Privacy
async function testUpdateGlobalPrivacy() {
  section('Test 3: Update Global Privacy Level');

  const newLevel = 75;
  info(`Setting global privacy to ${newLevel}%...`);

  const result = await apiRequest(`/api/privacy-controls/global/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ globalLevel: newLevel })
  });

  if (result.success) {
    success(`Global privacy updated to ${newLevel}%`);
    return true;
  } else {
    error(`Failed to update global privacy: ${result.error}`);
    return false;
  }
}

// Test 4: Update Single Cluster
async function testUpdateCluster() {
  section('Test 4: Update Single Cluster');

  const clusterId = 'entertainment-choices';
  const revelationLevel = 30;
  info(`Setting ${clusterId} to ${revelationLevel}%...`);

  const result = await apiRequest(`/api/privacy-controls/cluster/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ clusterId, revelationLevel, enabled: true })
  });

  if (result.success) {
    success(`Cluster ${clusterId} updated to ${revelationLevel}%`);
    return true;
  } else {
    error(`Failed to update cluster: ${result.error}`);
    return false;
  }
}

// Test 5: Batch Update Clusters
async function testBatchUpdate() {
  section('Test 5: Batch Update Clusters');

  const clusters = [
    { clusterId: 'musical-identity', revelationLevel: 85 },
    { clusterId: 'skills-expertise', revelationLevel: 100 },
    { clusterId: 'social-connections', revelationLevel: 60 }
  ];

  info(`Batch updating ${clusters.length} clusters...`);

  const result = await apiRequest(`/api/privacy-controls/cluster/batch/${userId}`, {
    method: 'POST',
    body: JSON.stringify({ clusters })
  });

  if (result.success) {
    success(`Batch update completed: ${clusters.length} clusters updated`);
    clusters.forEach(c => {
      info(`  ${c.clusterId}: ${c.revelationLevel}%`);
    });
    return true;
  } else {
    error(`Failed to batch update: ${result.error}`);
    return false;
  }
}

// Test 6: Get Privacy Statistics
async function testGetStats() {
  section('Test 6: Get Privacy Statistics');

  const result = await apiRequest(`/api/privacy-controls/summary/${userId}`);

  if (result.success) {
    const stats = result.data.stats;
    success('Privacy statistics retrieved');
    info(`  Total clusters: ${stats.totalClusters}`);
    info(`  Enabled clusters: ${stats.enabledClusters}`);
    info(`  Hidden clusters (0%): ${stats.hiddenClusters}`);
    info(`  Public clusters (100%): ${stats.publicClusters}`);
    info(`  Average revelation: ${stats.averageRevelation}%`);
    info(`  Global privacy: ${stats.globalPrivacy}%`);

    info('\n  Category Stats:');
    Object.entries(stats.categoryStats).forEach(([category, categoryStats]) => {
      info(`    ${category}: ${categoryStats.averageRevelation}% (${categoryStats.count} clusters)`);
    });
    return stats;
  } else {
    error(`Failed to get stats: ${result.error}`);
    return null;
  }
}

// Test 7: Context-Specific Privacy
async function testContextPrivacy() {
  section('Test 7: Context-Specific Privacy');

  // Get available contexts
  const contextsResult = await apiRequest(`/api/privacy-controls/contexts/${userId}`);

  if (contextsResult.success) {
    success('Available contexts retrieved');
    contextsResult.data.availableContexts.forEach(ctx => {
      info(`  ${ctx.name} (${ctx.id}): ${ctx.description}`);
    });

    // Update professional context
    info('\nSetting professional context overrides...');
    const overrides = {
      'entertainment-choices': 0,
      'social-connections': 20,
      'skills-expertise': 100,
      'career-jobs': 100
    };

    const updateResult = await apiRequest(`/api/privacy-controls/context/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ contextName: 'professional', clusterOverrides: overrides })
    });

    if (updateResult.success) {
      success('Professional context updated');
      Object.entries(overrides).forEach(([cluster, level]) => {
        info(`  ${cluster}: ${level}%`);
      });
      return true;
    } else {
      error(`Failed to update context: ${updateResult.error}`);
      return false;
    }
  } else {
    error(`Failed to get contexts: ${contextsResult.error}`);
    return false;
  }
}

// Test 8: Get Effective Privacy Level
async function testEffectiveLevel() {
  section('Test 8: Get Effective Privacy Level');

  const tests = [
    { clusterId: 'entertainment-choices', audienceId: 'social' },
    { clusterId: 'entertainment-choices', audienceId: 'professional' },
    { clusterId: 'skills-expertise', audienceId: 'professional' }
  ];

  let allSuccess = true;

  for (const test of tests) {
    const result = await apiRequest(
      `/api/privacy-controls/effective-level?userId=${userId}&clusterId=${test.clusterId}&audienceId=${test.audienceId}`
    );

    if (result.success) {
      info(`  ${test.clusterId} [${test.audienceId}]: ${result.data.effectivePrivacyLevel}%`);
    } else {
      error(`  Failed to get effective level for ${test.clusterId}`);
      allSuccess = false;
    }
  }

  if (allSuccess) {
    success('All effective privacy level checks passed');
  }

  return allSuccess;
}

// Test 9: Check Data Revelation
async function testCheckRevelation() {
  section('Test 9: Check Data Revelation');

  const tests = [
    { clusterId: 'entertainment-choices', dataSensitivity: 50, audienceId: 'social' },
    { clusterId: 'entertainment-choices', dataSensitivity: 50, audienceId: 'professional' },
    { clusterId: 'skills-expertise', dataSensitivity: 75, audienceId: 'professional' }
  ];

  let allSuccess = true;

  for (const test of tests) {
    const result = await apiRequest('/api/privacy-controls/check-revelation', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        clusterId: test.clusterId,
        dataSensitivity: test.dataSensitivity,
        audienceId: test.audienceId
      })
    });

    if (result.success) {
      const reveal = result.data.shouldReveal ? 'REVEAL' : 'HIDE';
      const color = result.data.shouldReveal ? 'green' : 'red';
      log(`  ${test.clusterId} [${test.audienceId}, sensitivity ${test.dataSensitivity}]: ${reveal}`, color);
    } else {
      error(`  Failed to check revelation for ${test.clusterId}`);
      allSuccess = false;
    }
  }

  if (allSuccess) {
    success('All revelation checks completed');
  }

  return allSuccess;
}

// Test 10: Reset Privacy Settings
async function testResetPrivacy() {
  section('Test 10: Reset Privacy Settings');

  info('Resetting all privacy settings to defaults (50%)...');

  const result = await apiRequest(`/api/privacy-controls/reset/${userId}`, {
    method: 'POST'
  });

  if (result.success) {
    success('Privacy settings reset to defaults');
    return true;
  } else {
    error(`Failed to reset privacy: ${result.error}`);
    return false;
  }
}

// Test 11: Get Life Clusters Configuration
async function testGetClusters() {
  section('Test 11: Get Life Clusters Configuration');

  const result = await apiRequest('/api/privacy-controls/clusters');

  if (result.success) {
    success('Life clusters configuration retrieved');

    info('\nCategories:');
    Object.entries(result.data.categories).forEach(([id, cat]) => {
      info(`  ${cat.name}: ${cat.description}`);
    });

    info('\nClusters by Category:');
    Object.entries(result.data.clusters).forEach(([category, clusters]) => {
      info(`  ${category}: ${clusters.length} clusters`);
    });

    info(`\nPlatform Mappings: ${Object.keys(result.data.platformMapping).length} platforms`);

    return true;
  } else {
    error(`Failed to get clusters: ${result.error}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  log('\n╔════════════════════════════════════════════════════════╗', 'blue');
  log('║     TWIN AI LEARN - PRIVACY SYSTEM TEST SUITE        ║', 'blue');
  log('╚════════════════════════════════════════════════════════╝\n', 'blue');

  const results = {
    total: 0,
    passed: 0,
    failed: 0
  };

  const tests = [
    { name: 'Authentication', fn: testAuthentication, critical: true },
    { name: 'Get Privacy Profile', fn: testGetPrivacyProfile },
    { name: 'Update Global Privacy', fn: testUpdateGlobalPrivacy },
    { name: 'Update Single Cluster', fn: testUpdateCluster },
    { name: 'Batch Update Clusters', fn: testBatchUpdate },
    { name: 'Get Privacy Statistics', fn: testGetStats },
    { name: 'Context-Specific Privacy', fn: testContextPrivacy },
    { name: 'Get Effective Privacy Level', fn: testEffectiveLevel },
    { name: 'Check Data Revelation', fn: testCheckRevelation },
    { name: 'Reset Privacy Settings', fn: testResetPrivacy },
    { name: 'Get Life Clusters Config', fn: testGetClusters }
  ];

  for (const test of tests) {
    results.total++;

    try {
      const result = await test.fn();

      if (result === false || result === null) {
        results.failed++;
        if (test.critical) {
          error(`\nCritical test "${test.name}" failed. Stopping test suite.`);
          break;
        }
      } else {
        results.passed++;
      }
    } catch (err) {
      results.failed++;
      error(`Test "${test.name}" threw error: ${err.message}`);
      if (test.critical) {
        break;
      }
    }

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Final results
  section('Test Results Summary');
  log(`Total Tests: ${results.total}`, 'blue');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');

  const percentage = Math.round((results.passed / results.total) * 100);
  log(`\nSuccess Rate: ${percentage}%\n`, percentage === 100 ? 'green' : 'yellow');

  if (results.failed === 0) {
    success('🎉 All tests passed! Privacy system is working correctly.\n');
  } else {
    error(`⚠️  ${results.failed} test(s) failed. Please review the errors above.\n`);
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// Start tests
(async () => {
  info('Checking if server is running...');
  const serverRunning = await checkServer();

  if (!serverRunning) {
    error(`\nServer is not running at ${API_BASE}`);
    info('Please start the server with: npm run server:dev\n');
    process.exit(1);
  }

  success(`Server is running at ${API_BASE}\n`);
  await runTests();
})();
