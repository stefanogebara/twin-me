/**
 * Test Soul Signature Analysis
 * Tests the Claude AI analysis of extracted platform data
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

// Import the analysis service
import { analyzeSoulSignature, getUserInsights } from './services/soulSignatureAnalysis.js';

const TEST_USER_ID = 'a483a979-cf85-481d-b65b-af396c2c513a'; // User with GitHub data

async function testSoulAnalysis() {
  console.log('🧪 Testing Soul Signature Analysis...\n');

  try {
    // Step 1: Trigger analysis
    console.log(`📊 Step 1: Analyzing soul data for user ${TEST_USER_ID}...`);
    const analysisResult = await analyzeSoulSignature(TEST_USER_ID);

    console.log('\n✅ Analysis completed!');
    console.log(`   - Success: ${analysisResult.success}`);
    console.log(`   - Insights generated: ${analysisResult.insightsGenerated}`);
    console.log(`   - Platforms analyzed: ${analysisResult.platforms.join(', ')}`);

    // Step 2: Retrieve insights
    console.log(`\n📖 Step 2: Fetching generated insights...`);
    const insights = await getUserInsights(TEST_USER_ID);

    console.log(`\n✅ Found ${insights.length} insights:`);
    insights.forEach((insight, index) => {
      console.log(`\n   ${index + 1}. ${insight.title}`);
      console.log(`      Type: ${insight.insight_type}`);
      console.log(`      Platforms: ${insight.platforms.join(', ')}`);
      console.log(`      Confidence: ${(insight.confidence_score * 100).toFixed(0)}%`);
      console.log(`      Description: ${insight.description.substring(0, 150)}...`);
    });

    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  }
}

// Run the test
testSoulAnalysis()
  .then(() => {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  });
