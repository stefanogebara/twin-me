/**
 * Test script for Gmail, Outlook, and LinkedIn Feature Extractors
 *
 * Tests the complete extraction pipeline:
 * 1. Extract features from user_platform_data
 * 2. Save features to behavioral_features table
 * 3. Verify stored features
 *
 * Run: node --experimental-vm-modules api/tests/test-feature-extractors.js
 */

import dotenv from 'dotenv';
dotenv.config();

import gmailFeatureExtractor from '../services/featureExtractors/gmailFeatureExtractor.js';
import outlookFeatureExtractor from '../services/featureExtractors/outlookFeatureExtractor.js';
import linkedinFeatureExtractor from '../services/featureExtractors/linkedinFeatureExtractor.js';
import { supabaseAdmin } from '../services/database.js';

const TEST_USER_GMAIL = 'ac667726-2a31-46de-bd84-a863ee7b5b10';  // has google_gmail data
const TEST_USER_OUTLOOK = 'ac667726-2a31-46de-bd84-a863ee7b5b10';  // has outlook data
const TEST_USER_LINKEDIN = 'ac667726-2a31-46de-bd84-a863ee7b5b10';  // has linkedin data

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

async function testGmailExtractor() {
  console.log('\n========================================');
  console.log('TEST: Gmail Feature Extractor');
  console.log('========================================');

  // Verify test data exists
  const { data: platformData } = await supabaseAdmin
    .from('user_platform_data')
    .select('data_type')
    .eq('user_id', TEST_USER_GMAIL)
    .eq('platform', 'google_gmail');

  assert(platformData && platformData.length > 0, `Gmail platform data exists (${platformData?.length} records)`);

  // Extract features
  const features = await gmailFeatureExtractor.extractFeatures(TEST_USER_GMAIL);
  console.log(`\n  Extracted features: ${features.length}`);
  assert(features.length > 0, 'Gmail extractor returned features');

  // Validate feature structure
  for (const f of features) {
    assert(f.user_id === TEST_USER_GMAIL, `Feature ${f.feature_type}: correct user_id`);
    assert(f.platform === 'gmail', `Feature ${f.feature_type}: platform is 'gmail'`);
    assert(typeof f.feature_value === 'number', `Feature ${f.feature_type}: feature_value is number (${f.feature_value})`);
    assert(f.feature_value >= 0 && f.feature_value <= 100, `Feature ${f.feature_type}: value in range 0-100 (${f.feature_value})`);
    assert(f.normalized_value >= 0 && f.normalized_value <= 1, `Feature ${f.feature_type}: normalized_value in range 0-1 (${f.normalized_value})`);
    assert(f.confidence_score === 65, `Feature ${f.feature_type}: confidence is 65`);
    assert(f.contributes_to !== null, `Feature ${f.feature_type}: contributes_to is set (${f.contributes_to})`);
    assert(f.contribution_weight > 0, `Feature ${f.feature_type}: contribution_weight > 0 (${f.contribution_weight})`);
  }

  // Save features
  const saveResult = await gmailFeatureExtractor.saveFeatures(features);
  assert(saveResult.success, `Gmail features saved successfully (${saveResult.saved} rows)`);

  // Verify in database
  const { data: stored } = await supabaseAdmin
    .from('behavioral_features')
    .select('*')
    .eq('user_id', TEST_USER_GMAIL)
    .eq('platform', 'gmail');

  assert(stored && stored.length === features.length, `Database has ${stored?.length} Gmail features (expected ${features.length})`);

  console.log('\n  Gmail feature types:', features.map(f => `${f.feature_type}=${f.feature_value}`).join(', '));
}

async function testOutlookExtractor() {
  console.log('\n========================================');
  console.log('TEST: Outlook Feature Extractor');
  console.log('========================================');

  // Verify test data exists
  const { data: platformData } = await supabaseAdmin
    .from('user_platform_data')
    .select('data_type')
    .eq('user_id', TEST_USER_OUTLOOK)
    .eq('platform', 'outlook');

  assert(platformData && platformData.length > 0, `Outlook platform data exists (${platformData?.length} records)`);
  console.log('  Data types:', platformData?.map(d => d.data_type).join(', '));

  // Extract features
  const features = await outlookFeatureExtractor.extractFeatures(TEST_USER_OUTLOOK);
  console.log(`\n  Extracted features: ${features.length}`);
  assert(features.length > 0, 'Outlook extractor returned features');

  // Validate feature structure
  for (const f of features) {
    assert(f.user_id === TEST_USER_OUTLOOK, `Feature ${f.feature_type}: correct user_id`);
    assert(f.platform === 'outlook', `Feature ${f.feature_type}: platform is 'outlook'`);
    assert(typeof f.feature_value === 'number', `Feature ${f.feature_type}: feature_value is number (${f.feature_value})`);
    assert(f.feature_value >= 0 && f.feature_value <= 100, `Feature ${f.feature_type}: value in range 0-100 (${f.feature_value})`);
    assert(f.normalized_value >= 0 && f.normalized_value <= 1, `Feature ${f.feature_type}: normalized_value in range 0-1 (${f.normalized_value})`);
    assert(f.confidence_score === 65, `Feature ${f.feature_type}: confidence is 65`);
    assert(f.contributes_to !== null, `Feature ${f.feature_type}: contributes_to is set (${f.contributes_to})`);
  }

  // Check expected features from test data
  const featureTypes = features.map(f => f.feature_type);
  assert(featureTypes.includes('email_volume'), 'Has email_volume feature');
  assert(featureTypes.includes('folder_organization'), 'Has folder_organization feature');
  assert(featureTypes.includes('calendar_density'), 'Has calendar_density feature');
  assert(featureTypes.includes('contact_network_size'), 'Has contact_network_size feature');
  assert(featureTypes.includes('work_hour_adherence'), 'Has work_hour_adherence feature');

  // Save features
  const saveResult = await outlookFeatureExtractor.saveFeatures(features);
  assert(saveResult.success, `Outlook features saved successfully (${saveResult.saved} rows)`);

  // Verify in database
  const { data: stored } = await supabaseAdmin
    .from('behavioral_features')
    .select('*')
    .eq('user_id', TEST_USER_OUTLOOK)
    .eq('platform', 'outlook');

  assert(stored && stored.length === features.length, `Database has ${stored?.length} Outlook features (expected ${features.length})`);

  console.log('\n  Outlook feature types:', features.map(f => `${f.feature_type}=${f.feature_value}`).join(', '));
}

async function testLinkedInExtractor() {
  console.log('\n========================================');
  console.log('TEST: LinkedIn Feature Extractor');
  console.log('========================================');

  // Verify test data exists
  const { data: platformData } = await supabaseAdmin
    .from('user_platform_data')
    .select('data_type')
    .eq('user_id', TEST_USER_LINKEDIN)
    .eq('platform', 'linkedin');

  assert(platformData && platformData.length > 0, `LinkedIn platform data exists (${platformData?.length} records)`);

  // Extract features
  const features = await linkedinFeatureExtractor.extractFeatures(TEST_USER_LINKEDIN);
  console.log(`\n  Extracted features: ${features.length}`);
  assert(features.length > 0, 'LinkedIn extractor returned features');

  // Validate feature structure
  for (const f of features) {
    assert(f.user_id === TEST_USER_LINKEDIN, `Feature ${f.feature_type}: correct user_id`);
    assert(f.platform === 'linkedin', `Feature ${f.feature_type}: platform is 'linkedin'`);
    assert(typeof f.feature_value === 'number', `Feature ${f.feature_type}: feature_value is number (${f.feature_value})`);
    assert(f.feature_value >= 0 && f.feature_value <= 100, `Feature ${f.feature_type}: value in range 0-100 (${f.feature_value})`);
    assert(f.confidence_score === 40, `Feature ${f.feature_type}: confidence is 40 (limited data)`);
  }

  // Check expected features
  const featureTypes = features.map(f => f.feature_type);
  assert(featureTypes.includes('profile_completeness'), 'Has profile_completeness feature');
  assert(featureTypes.includes('professional_presence'), 'Has professional_presence feature');

  // Save features
  const saveResult = await linkedinFeatureExtractor.saveFeatures(features);
  assert(saveResult.success, `LinkedIn features saved successfully (${saveResult.saved} rows)`);

  // Verify in database
  const { data: stored } = await supabaseAdmin
    .from('behavioral_features')
    .select('*')
    .eq('user_id', TEST_USER_LINKEDIN)
    .eq('platform', 'linkedin');

  assert(stored && stored.length === features.length, `Database has ${stored?.length} LinkedIn features (expected ${features.length})`);

  console.log('\n  LinkedIn feature types:', features.map(f => `${f.feature_type}=${f.feature_value}`).join(', '));
}

async function testIdempotency() {
  console.log('\n========================================');
  console.log('TEST: Idempotency (re-running extractors)');
  console.log('========================================');

  // Run Gmail extractor twice - should upsert, not duplicate
  const features1 = await gmailFeatureExtractor.extractFeatures(TEST_USER_GMAIL);
  await gmailFeatureExtractor.saveFeatures(features1);

  const features2 = await gmailFeatureExtractor.extractFeatures(TEST_USER_GMAIL);
  await gmailFeatureExtractor.saveFeatures(features2);

  const { data: stored } = await supabaseAdmin
    .from('behavioral_features')
    .select('*')
    .eq('user_id', TEST_USER_GMAIL)
    .eq('platform', 'gmail');

  assert(stored.length === features1.length, `No duplicates after re-run (${stored.length} rows, expected ${features1.length})`);
}

async function testCrossExtractorIntegration() {
  console.log('\n========================================');
  console.log('TEST: Cross-extractor Integration');
  console.log('========================================');

  // Verify all platforms have features for the same user
  const { data: allFeatures } = await supabaseAdmin
    .from('behavioral_features')
    .select('platform, feature_type, feature_value, contributes_to')
    .eq('user_id', TEST_USER_GMAIL)
    .in('platform', ['gmail', 'outlook', 'linkedin']);

  assert(allFeatures && allFeatures.length > 0, `Found ${allFeatures?.length} total features across platforms`);

  const platforms = [...new Set(allFeatures?.map(f => f.platform) || [])];
  assert(platforms.includes('gmail'), 'Gmail features present');
  assert(platforms.includes('outlook'), 'Outlook features present');
  assert(platforms.includes('linkedin'), 'LinkedIn features present');

  // Check trait coverage
  const traits = [...new Set(allFeatures?.map(f => f.contributes_to) || [])];
  console.log('  Trait coverage:', traits.join(', '));
  assert(traits.includes('conscientiousness'), 'Conscientiousness trait covered');
  assert(traits.includes('extraversion'), 'Extraversion trait covered');

  console.log('\n  All features summary:');
  for (const f of allFeatures || []) {
    console.log(`    [${f.platform}] ${f.feature_type} = ${f.feature_value} -> ${f.contributes_to}`);
  }
}

async function runAllTests() {
  console.log('==============================================');
  console.log('Feature Extractor Test Suite');
  console.log('==============================================');
  console.log(`Test user: ${TEST_USER_GMAIL}`);

  try {
    await testGmailExtractor();
    await testOutlookExtractor();
    await testLinkedInExtractor();
    await testIdempotency();
    await testCrossExtractorIntegration();
  } catch (error) {
    console.error('\nFATAL ERROR:', error);
    failed++;
  }

  console.log('\n==============================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('==============================================');

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests();
