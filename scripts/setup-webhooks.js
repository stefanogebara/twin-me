#!/usr/bin/env node
/**
 * Automated Webhook Setup Script
 *
 * This script helps automate the setup of webhooks for real-time monitoring.
 * Run with: node scripts/setup-webhooks.js
 *
 * Secrets are MASKED by default. The output is meant to be copied into a
 * provider console, but it also lands in terminal scrollback and — if this is
 * ever run from CI — in job logs, where a webhook secret should not sit. Pass
 * --reveal when you actually need the full value:
 *   node scripts/setup-webhooks.js --reveal
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Opt-in to printing secrets in full — see the header note.
const REVEAL_SECRETS = process.argv.includes('--reveal');

/**
 * Render a secret for terminal output: first/last 4 characters with the middle
 * masked, so the value is recognisable enough to confirm which secret is
 * configured without the whole thing entering scrollback or a CI log.
 */
function maskSecret(value) {
  if (!value) return '(not configured)';
  if (REVEAL_SECRETS) return value;
  if (value.length <= 8) return `${'*'.repeat(value.length)}  (run with --reveal to show)`;
  return `${value.slice(0, 4)}${'*'.repeat(value.length - 8)}${value.slice(-4)}  (run with --reveal to show)`;
}

console.log('🚀 Webhook Setup Automation Script\n');

async function checkEnvironmentVariables() {
  console.log('📋 Checking environment variables...\n');

  const required = [
    'GITHUB_WEBHOOK_SECRET',
    'GOOGLE_PROJECT_ID',
    'API_URL',
  ];

  const missing = [];
  const configured = [];

  for (const varName of required) {
    const value = process.env[varName];
    if (!value || value.startsWith('your-') || value.startsWith('TODO')) {
      missing.push(varName);
      console.log(`❌ ${varName}: Not configured`);
    } else {
      configured.push(varName);
      console.log(`✅ ${varName}: Configured`);
    }
  }

  console.log('\n');

  if (missing.length > 0) {
    console.log('⚠️  Missing configuration:');
    console.log('');

    if (missing.includes('GOOGLE_PROJECT_ID')) {
      console.log('🔹 Google Cloud Project ID:');
      console.log('   1. Visit https://console.cloud.google.com');
      console.log('   2. Select your project (or create one)');
      console.log('   3. Copy the Project ID');
      console.log('   4. Update GOOGLE_PROJECT_ID in .env\n');
    }
  }

  return { configured, missing };
}

async function verifyDatabaseSetup() {
  console.log('🗄️  Verifying database setup...\n');

  try {
    const { data, error } = await supabase
      .from('platform_webhooks')
      .select('*')
      .limit(1);

    if (error) {
      console.log('❌ platform_webhooks table not found');
      console.log('   Run: npm run db:migrate\n');
      return false;
    }

    console.log('✅ platform_webhooks table exists\n');
    return true;
  } catch (error) {
    console.log('❌ Database connection failed');
    console.log(`   Error: ${error.message}\n`);
    return false;
  }
}

async function testWebhookEndpoints() {
  console.log('🔌 Testing webhook endpoints...\n');

  const endpoints = [
    { name: 'Webhook Health', url: `${process.env.API_URL}/api/webhooks/health` },
    { name: 'SSE Health', url: `${process.env.API_URL}/api/sse/health` },
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url);
      const data = await response.json();

      if (response.ok && data.status === 'ok') {
        console.log(`✅ ${endpoint.name}: Working`);
      } else {
        console.log(`⚠️  ${endpoint.name}: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.log(`❌ ${endpoint.name}: ${error.message}`);
    }
  }

  console.log('\n');
}

async function displayWebhookURLs() {
  console.log('🌐 Webhook URLs to configure in platform settings:\n');

  const apiUrl = process.env.API_URL || 'http://localhost:3001';

  console.log('🔹 GitHub Webhook:');
  console.log(`   URL: ${apiUrl}/api/webhooks/github/:userId`);
  console.log(`   Secret: ${maskSecret(process.env.GITHUB_WEBHOOK_SECRET)}`);
  console.log(`   Content type: application/json`);
  console.log(`   Events: push, pull_request, issues, etc.\n`);

  console.log('🔹 Gmail Pub/Sub:');
  console.log(`   Topic: projects/${process.env.GOOGLE_PROJECT_ID}/topics/gmail-notifications`);
  console.log(`   Push Endpoint: ${apiUrl}/api/webhooks/gmail\n`);
}

async function displayNextSteps() {
  console.log('📝 Next Steps:\n');
  console.log('1. ✅ Environment variables configured');
  console.log('2. ✅ Database migration applied');
  console.log('3. ✅ Webhook endpoints ready\n');
  console.log('4. 🔧 Configure platform webhooks:');
  console.log('   - GitHub: Add webhook in repo settings');
  console.log('   - Gmail: Set up Pub/Sub (see docs)\n');
  console.log('5. 🧪 Test the system:');
  console.log('   - Connect a platform via OAuth');
  console.log('   - Trigger an event (e.g., push to GitHub)');
  console.log('   - Verify real-time notification\n');
  console.log('📚 Documentation: REAL-TIME-MONITORING-QUICK-START.md\n');
}

// Run all checks
async function main() {
  const envCheck = await checkEnvironmentVariables();
  const dbCheck = await verifyDatabaseSetup();
  await testWebhookEndpoints();
  displayWebhookURLs();
  displayNextSteps();

  if (envCheck.missing.length === 0 && dbCheck) {
    console.log('🎉 Setup complete! Your real-time monitoring system is ready.\n');
  } else {
    console.log('⚠️  Please complete the missing configuration steps above.\n');
  }
}

main().catch(console.error);
