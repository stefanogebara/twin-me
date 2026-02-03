/**
 * Test Script for Pattern Learning System
 *
 * Tests all 6 layers of the pattern learning architecture:
 * 1. Raw event storage
 * 2. Baseline computation
 * 3. Deviation detection
 * 4. Correlation discovery
 * 5. Hypothesis generation
 * 6. Proactive insights
 */

import 'dotenv/config';
import { supabaseAdmin } from './services/database.js';
import baselineEngine from './services/baselineEngine.js';
import deviationDetector from './services/deviationDetector.js';
import correlationEngine from './services/correlationDiscoveryEngine.js';
import hypothesisEngine from './services/patternHypothesisEngine.js';
import insightService from './services/proactiveInsightService.js';

// Test user ID (must exist in auth.users table)
const TEST_USER_ID = 'ffe9d539-bf6e-4b57-954d-a53fd61a35ba'; // test@example.com in auth.users

async function testPatternLearningSystem() {
  console.log('='.repeat(60));
  console.log('PATTERN LEARNING SYSTEM - INTEGRATION TEST');
  console.log('='.repeat(60));
  console.log();

  const results = {
    tables: false,
    rawEvents: false,
    baselines: false,
    deviations: false,
    correlations: false,
    hypotheses: false,
    insights: false
  };

  try {
    // Test 1: Verify tables exist
    console.log('📋 Test 1: Verifying database tables...');
    const { data: tables, error: tableError } = await supabaseAdmin
      .from('pl_user_baselines')
      .select('id')
      .limit(1);

    if (tableError && tableError.code === '42P01') {
      console.log('❌ Tables not found. Run migration first.');
      return results;
    }
    console.log('✅ Pattern learning tables exist');
    results.tables = true;

    // Test 2: Insert a test raw event
    console.log('\n📋 Test 2: Testing raw event storage...');
    const testEvent = {
      user_id: TEST_USER_ID,
      platform: 'whoop',
      event_type: 'recovery_logged',
      event_data: {
        recovery: { score: 72, hrv: 45, restingHeartRate: 58 }
      },
      event_timestamp: new Date().toISOString(),
      context: { time_of_day: 'morning', day_of_week: 'monday' }
    };

    const { data: rawEvent, error: rawError } = await supabaseAdmin
      .from('pl_raw_behavioral_events')
      .insert(testEvent)
      .select()
      .single();

    if (rawError) {
      console.log('❌ Failed to insert raw event:', rawError.message);
    } else {
      console.log('✅ Raw event stored:', rawEvent.id);
      results.rawEvents = true;
    }

    // Test 3: Test metric extraction
    console.log('\n📋 Test 3: Testing metric extraction...');
    const extractedMetrics = deviationDetector.extractMetrics({
      platform: 'whoop',
      event_type: 'recovery_logged',
      event_data: testEvent.event_data
    });
    console.log('✅ Extracted metrics:', extractedMetrics.map(m => `${m.metricName}=${m.value}`).join(', '));

    // Test 4: Test baseline retrieval
    console.log('\n📋 Test 4: Testing baseline engine...');
    const baseline = await baselineEngine.getBaseline(TEST_USER_ID, 'recovery', 30);
    if (baseline) {
      console.log(`✅ Found baseline for recovery: mean=${baseline.mean?.toFixed(2)}, stdDev=${baseline.std_dev?.toFixed(2)}`);
      results.baselines = true;
    } else {
      console.log('⚠️ No baseline found (expected for new users)');
      // Try to compute baselines
      console.log('   Attempting to compute baselines...');
      const computeResult = await baselineEngine.computeBaselines(TEST_USER_ID);
      console.log(`   Computed ${computeResult.computed} baselines for ${computeResult.metrics.length} metrics`);
      results.baselines = computeResult.computed > 0;
    }

    // Test 5: Test deviation checking
    console.log('\n📋 Test 5: Testing deviation detection...');
    const deviationCheck = await baselineEngine.checkDeviation(TEST_USER_ID, 'recovery', 45);
    if (deviationCheck.baseline) {
      console.log(`✅ Deviation check: zScore=${deviationCheck.zScore?.toFixed(2)}, significance=${deviationCheck.significance}`);
      results.deviations = true;
    } else {
      console.log('⚠️ Cannot check deviation without baseline');
    }

    // Test 6: Test correlation discovery
    console.log('\n📋 Test 6: Testing correlation discovery...');
    const activeCorrelations = await correlationEngine.getActiveCorrelations(TEST_USER_ID);
    console.log(`✅ Found ${activeCorrelations.length} active correlations`);
    if (activeCorrelations.length > 0) {
      const sample = activeCorrelations[0];
      console.log(`   Sample: ${sample.metric_a} ↔ ${sample.metric_b} (r=${sample.correlation_coefficient?.toFixed(2)})`);
      results.correlations = true;
    } else {
      console.log('⚠️ No correlations yet (need more data)');
    }

    // Test 7: Test hypothesis retrieval
    console.log('\n📋 Test 7: Testing hypothesis engine...');
    const hypotheses = await hypothesisEngine.getActiveHypotheses(TEST_USER_ID);
    console.log(`✅ Found ${hypotheses.length} active hypotheses`);
    if (hypotheses.length > 0) {
      console.log(`   Sample: "${hypotheses[0].hypothesis_text?.substring(0, 60)}..."`);
      results.hypotheses = true;
    }

    // Test 8: Test insight service
    console.log('\n📋 Test 8: Testing insight service...');
    const pendingInsights = await insightService.getPendingInsights(TEST_USER_ID, 5);
    console.log(`✅ Found ${pendingInsights.length} pending insights`);
    if (pendingInsights.length > 0) {
      console.log(`   Sample: "${pendingInsights[0].message?.substring(0, 60)}..."`);
      results.insights = true;
    }

    // Test 9: Test hypothesis summary
    console.log('\n📋 Test 9: Testing hypothesis summary...');
    const summary = await hypothesisEngine.getHypothesisSummary(TEST_USER_ID);
    console.log(`✅ Hypothesis summary: total=${summary.total}, avgConfidence=${summary.avgConfidence}`);

    // Test 10: Test insight stats
    console.log('\n📋 Test 10: Testing insight statistics...');
    const stats = await insightService.getInsightStats(TEST_USER_ID);
    console.log(`✅ Insight stats: total=${stats.total}, avgConfidence=${stats.avgConfidence}`);

    // Cleanup test data
    console.log('\n🧹 Cleaning up test data...');
    if (rawEvent) {
      await supabaseAdmin
        .from('pl_raw_behavioral_events')
        .delete()
        .eq('id', rawEvent.id);
      console.log('✅ Cleaned up test event');
    }

  } catch (error) {
    console.error('\n❌ Test error:', error.message);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Tables exist:      ${results.tables ? '✅' : '❌'}`);
  console.log(`Raw events:        ${results.rawEvents ? '✅' : '❌'}`);
  console.log(`Baselines:         ${results.baselines ? '✅' : '⚠️ (no data)'}`);
  console.log(`Deviations:        ${results.deviations ? '✅' : '⚠️ (needs baseline)'}`);
  console.log(`Correlations:      ${results.correlations ? '✅' : '⚠️ (needs data)'}`);
  console.log(`Hypotheses:        ${results.hypotheses ? '✅' : '⚠️ (needs correlations)'}`);
  console.log(`Insights:          ${results.insights ? '✅' : '⚠️ (needs hypotheses)'}`);
  console.log();

  const passed = Object.values(results).filter(v => v).length;
  const total = Object.keys(results).length;
  console.log(`Overall: ${passed}/${total} tests passed`);
  console.log('='.repeat(60));

  return results;
}

/**
 * Generate sample data for testing
 */
async function insertSampleData(userId) {
  console.log('\n📊 Inserting sample data for testing...');

  const events = [];
  const now = new Date();

  // Generate 14 days of Whoop data
  for (let i = 0; i < 14; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Recovery varies with some pattern
    const baseRecovery = 65 + Math.sin(i * 0.5) * 15 + (Math.random() - 0.5) * 10;
    const hrv = 40 + Math.sin(i * 0.5) * 10 + (Math.random() - 0.5) * 5;

    events.push({
      user_id: userId,
      platform: 'whoop',
      event_type: 'recovery_logged',
      event_data: {
        recovery: { score: Math.round(baseRecovery), hrv: Math.round(hrv), restingHeartRate: 55 + Math.round(Math.random() * 10) }
      },
      event_timestamp: date.toISOString(),
      context: { time_of_day: 'morning', day_of_week: date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() }
    });
  }

  // Generate 14 days of Spotify data (correlated with recovery)
  for (let i = 0; i < 14; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Music valence slightly correlated with recovery pattern
    const baseValence = 0.5 + Math.sin(i * 0.5) * 0.2 + (Math.random() - 0.5) * 0.1;

    events.push({
      user_id: userId,
      platform: 'spotify',
      event_type: 'track_played',
      event_data: {
        track: { valence: baseValence, energy: 0.6 + Math.random() * 0.2, tempo: 120 + Math.random() * 30 }
      },
      event_timestamp: date.toISOString(),
      context: { time_of_day: 'afternoon', day_of_week: date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() }
    });
  }

  const { data, error } = await supabaseAdmin
    .from('pl_raw_behavioral_events')
    .insert(events)
    .select('id');

  if (error) {
    console.log('❌ Failed to insert sample data:', error.message);
    return [];
  }

  console.log(`✅ Inserted ${data.length} sample events`);
  return data.map(d => d.id);
}

/**
 * Clean up sample data
 */
async function cleanupSampleData(eventIds) {
  if (eventIds.length === 0) return;

  const { error } = await supabaseAdmin
    .from('pl_raw_behavioral_events')
    .delete()
    .in('id', eventIds);

  if (!error) {
    console.log(`✅ Cleaned up ${eventIds.length} sample events`);
  }
}

/**
 * Full pipeline test with sample data
 */
async function testFullPipeline() {
  console.log('\n' + '='.repeat(60));
  console.log('FULL PIPELINE TEST WITH SAMPLE DATA');
  console.log('='.repeat(60));

  const sampleEventIds = await insertSampleData(TEST_USER_ID);

  if (sampleEventIds.length === 0) {
    console.log('❌ Cannot proceed without sample data');
    return;
  }

  try {
    // Test baseline computation with sample data
    console.log('\n📋 Computing baselines from sample data...');
    const baselineResult = await baselineEngine.computeBaselines(TEST_USER_ID);
    console.log(`✅ Computed ${baselineResult.computed} baselines for metrics: ${baselineResult.metrics.join(', ')}`);

    // Test deviation detection
    console.log('\n📋 Testing deviation detection...');
    const deviationCheck = await baselineEngine.checkDeviation(TEST_USER_ID, 'recovery', 45);
    if (deviationCheck.baseline) {
      console.log(`✅ Deviation check for recovery=45: zScore=${deviationCheck.zScore?.toFixed(2)}, significance=${deviationCheck.significance}`);
    }

    // Test correlation discovery
    console.log('\n📋 Discovering correlations...');
    const correlationResult = await correlationEngine.discoverCorrelations(TEST_USER_ID, true);
    console.log(`✅ Discovered ${correlationResult.discovered} correlations`);

    if (correlationResult.discovered > 0) {
      const correlations = await correlationEngine.getActiveCorrelations(TEST_USER_ID);
      for (const c of correlations.slice(0, 3)) {
        console.log(`   ${c.metric_a} ↔ ${c.metric_b}: r=${c.correlation_coefficient?.toFixed(2)}, strength=${c.strength}`);
      }
    }

    // Test hypothesis generation
    console.log('\n📋 Generating hypotheses...');
    const hypothesisResult = await hypothesisEngine.generateHypotheses(TEST_USER_ID, false); // Use rule-based for speed
    console.log(`✅ Generated ${hypothesisResult.generated} hypotheses`);

    if (hypothesisResult.generated > 0) {
      for (const h of hypothesisResult.hypotheses.slice(0, 2)) {
        console.log(`   "${h.text}" (confidence: ${h.confidence?.toFixed(2)})`);
      }
    }

    console.log('\n✅ FULL PIPELINE TEST COMPLETE');

  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await cleanupSampleData(sampleEventIds);

    // Clean up generated baselines, correlations, hypotheses
    await supabaseAdmin.from('pl_user_baselines').delete().eq('user_id', TEST_USER_ID);
    await supabaseAdmin.from('pl_pattern_hypotheses').delete().eq('user_id', TEST_USER_ID);
    await supabaseAdmin.from('pl_discovered_correlations').delete().eq('user_id', TEST_USER_ID);
    console.log('✅ Cleaned up all test data');
  }
}

// Run tests
testPatternLearningSystem()
  .then(() => testFullPipeline())
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
