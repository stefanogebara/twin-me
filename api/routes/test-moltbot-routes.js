/**
 * Moltbot API Routes Test
 *
 * Verifies that all Moltbot API routes are properly configured and accessible.
 * Run with: node api/routes/test-moltbot-routes.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

console.log('='.repeat(60));
console.log('MOLTBOT API ROUTES TEST');
console.log('='.repeat(60));

async function runTests() {
  const results = { passed: 0, failed: 0, tests: [] };

  function test(name, fn) {
    try {
      fn();
      results.passed++;
      results.tests.push({ name, status: 'PASS' });
      console.log(`  [PASS] ${name}`);
    } catch (error) {
      results.failed++;
      results.tests.push({ name, status: 'FAIL', error: error.message });
      console.log(`  [FAIL] ${name}: ${error.message}`);
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      results.passed++;
      results.tests.push({ name, status: 'PASS' });
      console.log(`  [PASS] ${name}`);
    } catch (error) {
      results.failed++;
      results.tests.push({ name, status: 'FAIL', error: error.message });
      console.log(`  [FAIL] ${name}: ${error.message}`);
    }
  }

  // Test 1: Import moltbot routes
  console.log('\n--- Route Import Tests ---');
  let moltbotRouter;
  await asyncTest('Import moltbot.js routes', async () => {
    const module = await import('./moltbot.js');
    moltbotRouter = module.default;
    if (!moltbotRouter) throw new Error('Router is undefined');
  });

  test('Router has stack with routes', () => {
    if (!moltbotRouter.stack) throw new Error('Router has no stack');
    if (moltbotRouter.stack.length === 0) throw new Error('Router stack is empty');
  });

  // Test 2: Verify route handlers exist
  console.log('\n--- Route Handler Tests ---');
  const expectedRoutes = [
    { method: 'get', path: '/triggers' },
    { method: 'get', path: '/triggers/templates' },
    { method: 'post', path: '/triggers' },
    { method: 'put', path: '/triggers/:id' },
    { method: 'delete', path: '/triggers/:id' },
    { method: 'post', path: '/triggers/install-defaults' },
    { method: 'get', path: '/notifications' },
    { method: 'get', path: '/insights' },
    { method: 'get', path: '/clusters' },
    { method: 'post', path: '/clusters/rebuild' },
    { method: 'get', path: '/clusters/definitions' },
    { method: 'get', path: '/agents/status' },
    { method: 'post', path: '/agents/run/:platform' },
    { method: 'post', path: '/agents/initialize' },
    { method: 'get', path: '/agents/history' },
    { method: 'get', path: '/memory/recent' },
    { method: 'get', path: '/memory/facts' },
    { method: 'get', path: '/correlations/sources' },
    { method: 'get', path: '/correlations/features/:platform' }
  ];

  const routes = moltbotRouter.stack
    .filter(layer => layer.route)
    .map(layer => ({
      method: Object.keys(layer.route.methods)[0],
      path: layer.route.path
    }));

  for (const expected of expectedRoutes) {
    test(`Route ${expected.method.toUpperCase()} ${expected.path}`, () => {
      const found = routes.find(r =>
        r.method === expected.method && r.path === expected.path
      );
      if (!found) {
        throw new Error(`Route not found: ${expected.method.toUpperCase()} ${expected.path}`);
      }
    });
  }

  test(`Total routes count matches expected (${expectedRoutes.length})`, () => {
    if (routes.length !== expectedRoutes.length) {
      throw new Error(`Expected ${expectedRoutes.length} routes, found ${routes.length}`);
    }
  });

  // Test 3: Import service dependencies
  console.log('\n--- Service Dependency Tests ---');
  await asyncTest('Import moltbotTriggerService', async () => {
    const { getTriggerService, getDefaultTriggerTemplates } = await import('../services/moltbot/moltbotTriggerService.js');
    if (!getTriggerService) throw new Error('getTriggerService not exported');
    if (!getDefaultTriggerTemplates) throw new Error('getDefaultTriggerTemplates not exported');
  });

  await asyncTest('Import moltbotMemoryService', async () => {
    const { getMemoryService } = await import('../services/moltbot/moltbotMemoryService.js');
    if (!getMemoryService) throw new Error('getMemoryService not exported');
  });

  await asyncTest('Import agentScheduler', async () => {
    const { getAgentScheduler } = await import('../services/moltbot/agentScheduler.js');
    if (!getAgentScheduler) throw new Error('getAgentScheduler not exported');
  });

  await asyncTest('Import clusterPersonalityBuilder', async () => {
    const { getClusterPersonalityBuilder, CLUSTER_DEFINITIONS } = await import('../services/clusterPersonalityBuilder.js');
    if (!getClusterPersonalityBuilder) throw new Error('getClusterPersonalityBuilder not exported');
    if (!CLUSTER_DEFINITIONS) throw new Error('CLUSTER_DEFINITIONS not exported');
  });

  await asyncTest('Import correlationMatcherService', async () => {
    const { getCorrelationMatcherService } = await import('../services/correlationMatcherService.js');
    if (!getCorrelationMatcherService) throw new Error('getCorrelationMatcherService not exported');
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`RESULTS: ${results.passed} passed, ${results.failed} failed`);
  console.log('='.repeat(60));

  if (results.failed > 0) {
    console.log('\nFailed tests:');
    results.tests.filter(t => t.status === 'FAIL').forEach(t => {
      console.log(`  - ${t.name}: ${t.error}`);
    });
    process.exit(1);
  }

  console.log('\nAll Moltbot API routes tests passed!');
  process.exit(0);
}

runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
