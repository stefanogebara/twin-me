/**
 * Moltbot E2E Integration Test
 *
 * Tests the full Moltbot integration against a running server.
 * Requires: Backend running on port 3001
 *
 * Run with: node api/routes/test-moltbot-e2e.js
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

console.log('='.repeat(60));
console.log('MOLTBOT E2E INTEGRATION TEST');
console.log('API Base:', API_BASE);
console.log('='.repeat(60));

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

async function test(name, fn) {
  try {
    const result = await fn();
    results.passed++;
    results.tests.push({ name, status: 'PASS', result });
    console.log(`  [PASS] ${name}`);
    return result;
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', error: error.message });
    console.log(`  [FAIL] ${name}: ${error.message}`);
    return null;
  }
}

function skip(name, reason) {
  results.skipped++;
  results.tests.push({ name, status: 'SKIP', reason });
  console.log(`  [SKIP] ${name}: ${reason}`);
}

async function fetchJSON(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.substring(0, 100)}`);
  }

  return response.json();
}

async function runTests() {
  // Test 1: Server Health
  console.log('\n--- Server Health ---');
  const serverUp = await test('Server is responding', async () => {
    const response = await fetch(`${API_BASE}/api/health`);
    if (!response.ok) throw new Error('Health check failed');
    return true;
  });

  if (!serverUp) {
    console.log('\n[ERROR] Server is not running. Start with: npm run server:dev');
    process.exit(1);
  }

  // Test 2: Trigger Templates (no auth required for templates)
  console.log('\n--- Trigger System ---');
  await test('GET /api/moltbot/triggers/templates returns templates', async () => {
    const data = await fetchJSON('/api/moltbot/triggers/templates');
    if (!data.templates || !Array.isArray(data.templates)) {
      throw new Error('Expected templates array');
    }
    if (data.templates.length === 0) {
      throw new Error('Expected at least one template');
    }
    console.log(`    Found ${data.templates.length} templates`);
    return data.templates.length;
  });

  // Test 3: Cluster Definitions (no auth required)
  console.log('\n--- Cluster System ---');
  await test('GET /api/moltbot/clusters/definitions returns clusters', async () => {
    const data = await fetchJSON('/api/moltbot/clusters/definitions');
    // API returns 'definitions' not 'clusters'
    const clusters = data.definitions || data.clusters;
    if (!clusters) {
      throw new Error('Expected definitions/clusters object');
    }
    const clusterNames = Object.keys(clusters);
    if (!clusterNames.includes('personal') || !clusterNames.includes('professional')) {
      throw new Error('Expected personal and professional clusters');
    }
    console.log(`    Found clusters: ${clusterNames.join(', ')}`);
    return clusterNames;
  });

  // Test 4: Correlation Sources (no auth required)
  console.log('\n--- Correlation System ---');
  await test('GET /api/moltbot/correlations/sources returns research data', async () => {
    const data = await fetchJSON('/api/moltbot/correlations/sources');
    // API returns 'sources' not 'papers'
    const sources = data.sources || data.papers;
    if (!sources || !Array.isArray(sources)) {
      throw new Error('Expected sources/papers array');
    }
    console.log(`    Found ${sources.length} research sources`);
    return sources.length;
  });

  await test('GET /api/moltbot/correlations/features/spotify returns features', async () => {
    const data = await fetchJSON('/api/moltbot/correlations/features/spotify');
    if (!data.features || !Array.isArray(data.features)) {
      throw new Error('Expected features array');
    }
    console.log(`    Found ${data.features.length} Spotify features`);
    return data.features.length;
  });

  // Test 5: Agent Status (no auth required for status check)
  console.log('\n--- Agent System ---');
  await test('GET /api/moltbot/agents/status returns agent status', async () => {
    const data = await fetchJSON('/api/moltbot/agents/status');
    if (typeof data.initialized !== 'boolean') {
      throw new Error('Expected initialized field');
    }
    console.log(`    Agents initialized: ${data.initialized}`);
    return data;
  });

  // Tests requiring authentication
  console.log('\n--- Authenticated Endpoints ---');
  skip('GET /api/moltbot/triggers', 'Requires authentication');
  skip('POST /api/moltbot/triggers', 'Requires authentication');
  skip('GET /api/moltbot/notifications', 'Requires authentication');
  skip('GET /api/moltbot/insights', 'Requires authentication');
  skip('GET /api/moltbot/clusters', 'Requires authentication');
  skip('GET /api/moltbot/memory/recent', 'Requires authentication');
  skip('GET /api/moltbot/memory/facts', 'Requires authentication');

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`RESULTS: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);
  console.log('='.repeat(60));

  if (results.failed > 0) {
    console.log('\nFailed tests:');
    results.tests.filter(t => t.status === 'FAIL').forEach(t => {
      console.log(`  - ${t.name}: ${t.error}`);
    });
    process.exit(1);
  }

  console.log('\nE2E tests completed successfully!');
  console.log('\nNote: Authenticated endpoints were skipped. To test those:');
  console.log('  1. Log into the app in browser');
  console.log('  2. Copy the JWT token from localStorage');
  console.log('  3. Test manually with: curl -H "Authorization: Bearer <token>" ...');
  process.exit(0);
}

runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
