/**
 * Moltbot Services Test Script
 * Run with: node api/services/moltbot/test-moltbot.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Set minimal required env vars for testing
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

console.log('='.repeat(60));
console.log('MOLTBOT SERVICES TEST');
console.log('='.repeat(60));

async function runTests() {
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  function test(name, fn) {
    try {
      fn();
      results.passed++;
      results.tests.push({ name, status: 'PASS' });
      console.log(`✅ ${name}`);
    } catch (error) {
      results.failed++;
      results.tests.push({ name, status: 'FAIL', error: error.message });
      console.log(`❌ ${name}: ${error.message}`);
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      results.passed++;
      results.tests.push({ name, status: 'PASS' });
      console.log(`✅ ${name}`);
    } catch (error) {
      results.failed++;
      results.tests.push({ name, status: 'FAIL', error: error.message });
      console.log(`❌ ${name}: ${error.message}`);
    }
  }

  // Test 1: Import moltbotConfig
  console.log('\n--- Config Tests ---');
  let config;
  await asyncTest('Import moltbotConfig', async () => {
    const module = await import('../../config/moltbotConfig.js');
    config = module.default;
    if (!config) throw new Error('Config is undefined');
    if (!config.ws) throw new Error('Config.ws is missing');
    if (!config.clusters) throw new Error('Config.clusters is missing');
  });

  test('Config has correct structure', () => {
    if (!config.ws.url) throw new Error('Missing ws.url');
    if (!config.workspace.memoryLayers) throw new Error('Missing memoryLayers');
    if (config.workspace.memoryLayers.length !== 4) throw new Error('Expected 4 memory layers');
  });

  await asyncTest('validateConfig function works', async () => {
    const { validateConfig } = await import('../../config/moltbotConfig.js');
    const result = validateConfig();
    if (typeof result.isValid !== 'boolean') throw new Error('validateConfig should return isValid');
  });

  await asyncTest('getPlatformCluster function works', async () => {
    const { getPlatformCluster } = await import('../../config/moltbotConfig.js');
    if (getPlatformCluster('spotify') !== 'personal') throw new Error('Spotify should be personal');
    if (getPlatformCluster('github') !== 'professional') throw new Error('GitHub should be professional');
    if (getPlatformCluster('whoop') !== 'health') throw new Error('Whoop should be health');
  });

  // Test 2: Import MoltbotClient
  console.log('\n--- Client Tests ---');
  let MoltbotClient, getMoltbotClient;
  await asyncTest('Import moltbotClient', async () => {
    const module = await import('./moltbotClient.js');
    MoltbotClient = module.MoltbotClient;
    getMoltbotClient = module.getMoltbotClient;
    if (!MoltbotClient) throw new Error('MoltbotClient is undefined');
    if (!getMoltbotClient) throw new Error('getMoltbotClient is undefined');
  });

  test('MoltbotClient can be instantiated', () => {
    const client = new MoltbotClient('test-user-123');
    if (!client) throw new Error('Client instantiation failed');
    if (client.userId !== 'test-user-123') throw new Error('userId not set correctly');
  });

  test('MoltbotClient requires userId', () => {
    try {
      new MoltbotClient();
      throw new Error('Should have thrown error');
    } catch (e) {
      if (!e.message.includes('userId')) throw new Error('Wrong error message');
    }
  });

  test('getMoltbotClient returns singleton per user', () => {
    const client1 = getMoltbotClient('user-singleton-test');
    const client2 = getMoltbotClient('user-singleton-test');
    if (client1 !== client2) throw new Error('Should return same instance');
  });

  // Test 3: Import WorkspaceManager
  console.log('\n--- Workspace Manager Tests ---');
  let MoltbotWorkspaceManager, getWorkspaceManager;
  await asyncTest('Import moltbotWorkspaceManager', async () => {
    const module = await import('./moltbotWorkspaceManager.js');
    MoltbotWorkspaceManager = module.MoltbotWorkspaceManager;
    getWorkspaceManager = module.getWorkspaceManager;
    if (!MoltbotWorkspaceManager) throw new Error('MoltbotWorkspaceManager is undefined');
  });

  test('WorkspaceManager can be instantiated', () => {
    const manager = new MoltbotWorkspaceManager('test-user-456');
    if (!manager) throw new Error('Manager instantiation failed');
    if (manager.userId !== 'test-user-456') throw new Error('userId not set correctly');
  });

  test('generateSoulMd produces valid markdown', () => {
    const manager = new MoltbotWorkspaceManager('test-user');
    const soulSignature = {
      user_name: 'Test User',
      big_five: { openness: 75, conscientiousness: 60, extraversion: 45, agreeableness: 80, neuroticism: 30 },
      mbti: { type: 'INFP', confidence: 85 },
      data_sources: ['spotify', 'whoop']
    };
    const md = manager.generateSoulMd(soulSignature);
    if (!md.includes('# Soul Signature')) throw new Error('Missing header');
    if (!md.includes('Openness')) throw new Error('Missing traits');
    if (!md.includes('INFP')) throw new Error('Missing MBTI');
  });

  // Test 4: Import MemoryService
  console.log('\n--- Memory Service Tests ---');
  let MoltbotMemoryService, getMemoryService;
  await asyncTest('Import moltbotMemoryService', async () => {
    const module = await import('./moltbotMemoryService.js');
    MoltbotMemoryService = module.MoltbotMemoryService;
    getMemoryService = module.getMemoryService;
    if (!MoltbotMemoryService) throw new Error('MoltbotMemoryService is undefined');
  });

  test('MemoryService can be instantiated', () => {
    const memory = new MoltbotMemoryService('test-user-789');
    if (!memory) throw new Error('Memory service instantiation failed');
  });

  test('bayesianConfidenceUpdate works correctly', () => {
    const memory = new MoltbotMemoryService('test-user');
    const result = memory.bayesianConfidenceUpdate(0.5, 0.8);
    if (result <= 0.5 || result >= 1) throw new Error(`Invalid confidence: ${result}`);
  });

  test('calculatePatternConfidence works', () => {
    const memory = new MoltbotMemoryService('test-user');
    const conf1 = memory.calculatePatternConfidence(3, '7d'); // min observations
    const conf2 = memory.calculatePatternConfidence(30, '7d'); // many observations
    if (conf1 >= conf2) throw new Error('More observations should increase confidence');
    if (conf1 < 0.3 || conf2 > 0.9) throw new Error('Confidence out of expected range');
  });

  // Test 5: Import TriggerService
  console.log('\n--- Trigger Service Tests ---');
  let MoltbotTriggerService, getTriggerService, getDefaultTriggerTemplates;
  await asyncTest('Import moltbotTriggerService', async () => {
    const module = await import('./moltbotTriggerService.js');
    MoltbotTriggerService = module.MoltbotTriggerService;
    getTriggerService = module.getTriggerService;
    getDefaultTriggerTemplates = module.getDefaultTriggerTemplates;
    if (!MoltbotTriggerService) throw new Error('MoltbotTriggerService is undefined');
  });

  test('TriggerService can be instantiated', () => {
    const triggers = new MoltbotTriggerService('test-user-trigger');
    if (!triggers) throw new Error('Trigger service instantiation failed');
  });

  test('getDefaultTriggerTemplates returns array', () => {
    const templates = getDefaultTriggerTemplates();
    if (!Array.isArray(templates)) throw new Error('Should return array');
    if (templates.length < 2) throw new Error('Should have at least 2 default templates');
  });

  test('Default triggers have required fields', () => {
    const templates = getDefaultTriggerTemplates();
    for (const t of templates) {
      if (!t.name) throw new Error('Missing name');
      if (!t.conditions || !Array.isArray(t.conditions)) throw new Error('Missing conditions');
      if (!t.actions || !Array.isArray(t.actions)) throw new Error('Missing actions');
    }
  });

  // Test 6: Import Extraction Agents
  console.log('\n--- Extraction Agent Tests ---');
  let getExtractionAgent, extractionAgentConfigs;
  await asyncTest('Import extractionAgents', async () => {
    const module = await import('./extractionAgents.js');
    getExtractionAgent = module.getExtractionAgent;
    extractionAgentConfigs = module.extractionAgentConfigs;
    if (!getExtractionAgent) throw new Error('getExtractionAgent is undefined');
    if (!extractionAgentConfigs) throw new Error('extractionAgentConfigs is undefined');
  });

  test('extractionAgentConfigs has Spotify, Calendar, Whoop', () => {
    if (!extractionAgentConfigs.spotify) throw new Error('Missing spotify config');
    if (!extractionAgentConfigs.calendar) throw new Error('Missing calendar config');
    if (!extractionAgentConfigs.whoop) throw new Error('Missing whoop config');
  });

  test('Agent configs have required fields', () => {
    for (const [platform, cfg] of Object.entries(extractionAgentConfigs)) {
      if (!cfg.type) throw new Error(`${platform}: Missing type`);
      if (!cfg.AgentClass) throw new Error(`${platform}: Missing AgentClass`);
      if (!cfg.schedule) throw new Error(`${platform}: Missing schedule`);
    }
  });

  // Test 7: Import Agent Scheduler
  console.log('\n--- Agent Scheduler Tests ---');
  let AgentScheduler, getAgentScheduler;
  await asyncTest('Import agentScheduler', async () => {
    const module = await import('./agentScheduler.js');
    AgentScheduler = module.AgentScheduler;
    getAgentScheduler = module.getAgentScheduler;
    if (!AgentScheduler) throw new Error('AgentScheduler is undefined');
    if (!getAgentScheduler) throw new Error('getAgentScheduler is undefined');
  });

  test('AgentScheduler can be instantiated', () => {
    const scheduler = new AgentScheduler('test-user-scheduler');
    if (!scheduler) throw new Error('Scheduler instantiation failed');
    if (scheduler.userId !== 'test-user-scheduler') throw new Error('userId not set correctly');
  });

  // Test 8: Import index.js
  console.log('\n--- Index Export Tests ---');
  await asyncTest('Import index.js exports all services', async () => {
    const index = await import('./index.js');
    if (!index.getMoltbotClient) throw new Error('Missing getMoltbotClient');
    if (!index.getMemoryService) throw new Error('Missing getMemoryService');
    if (!index.getTriggerService) throw new Error('Missing getTriggerService');
    if (!index.getWorkspaceManager) throw new Error('Missing getWorkspaceManager');
    if (!index.initializeMoltbotForUser) throw new Error('Missing initializeMoltbotForUser');
    if (!index.getExtractionAgent) throw new Error('Missing getExtractionAgent');
    if (!index.getAgentScheduler) throw new Error('Missing getAgentScheduler');
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

  console.log('\n✅ All tests passed! Moltbot services are ready.');
  process.exit(0);
}

runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
