/**
 * Automated OAuth Setup Script
 * Uses Playwright to help register OAuth applications
 *
 * Usage: node scripts/oauth-auto-setup.js [platform]
 * Example: node scripts/oauth-auto-setup.js spotify
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

const PLATFORMS = {
  spotify: {
    url: 'https://developer.spotify.com/dashboard',
    name: 'Spotify',
    steps: [
      'Navigate to dashboard',
      'Click "Create app"',
      'Fill in app details',
      'Set redirect URI: http://localhost:3001/api/platforms/callback/spotify',
      'Get Client ID and Client Secret'
    ]
  },
  deezer: {
    url: 'https://developers.deezer.com/myapps',
    name: 'Deezer',
    steps: [
      'Navigate to My Apps',
      'Click "Create a new Application"',
      'Fill in application name: Soul Signature',
      'Set redirect URI: http://localhost:3001/api/platforms/callback/deezer',
      'Submit and get credentials'
    ]
  },
  fitbit: {
    url: 'https://dev.fitbit.com/apps',
    name: 'Fitbit',
    steps: [
      'Go to Register An App',
      'Fill in application details',
      'Set OAuth 2.0 Application Type: Server',
      'Set callback URL: http://localhost:3001/api/platforms/callback/fitbit',
      'Get Client ID and Secret'
    ]
  },
  whoop: {
    url: 'https://developer.whoop.com',
    name: 'Whoop',
    steps: [
      'Sign up for developer account',
      'Create new application',
      'Set redirect URI: http://localhost:3001/api/platforms/callback/whoop',
      'Get credentials'
    ]
  },
  soundcloud: {
    url: 'https://soundcloud.com/you/apps',
    name: 'SoundCloud',
    steps: [
      'Navigate to Your Apps',
      'Register a new app',
      'Set redirect URI: http://localhost:3001/api/platforms/callback/soundcloud',
      'Get Client ID and Secret'
    ]
  }
};

async function updateEnvFile(platform, clientId, clientSecret) {
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  const platformUpper = platform.toUpperCase();

  // Remove existing entries if any
  envContent = envContent.replace(new RegExp(`${platformUpper}_CLIENT_ID=.*\\n?`, 'g'), '');
  envContent = envContent.replace(new RegExp(`${platformUpper}_CLIENT_SECRET=.*\\n?`, 'g'), '');

  // Add new entries
  envContent += `\n# ${PLATFORMS[platform].name} OAuth\n`;
  envContent += `${platformUpper}_CLIENT_ID=${clientId}\n`;
  envContent += `${platformUpper}_CLIENT_SECRET=${clientSecret}\n`;

  fs.writeFileSync(envPath, envContent);
  console.log(`✅ Updated .env with ${PLATFORMS[platform].name} credentials`);
}

async function setupPlatform(platform) {
  const config = PLATFORMS[platform];

  console.log(`\n🚀 Setting up ${config.name} OAuth Application\n`);
  console.log(`📍 Dashboard: ${config.url}\n`);

  console.log('Steps to follow:');
  config.steps.forEach((step, i) => {
    console.log(`  ${i + 1}. ${step}`);
  });

  console.log(`\n🌐 Opening ${config.name} developer portal...`);
  console.log(`Please complete the OAuth app registration manually.`);
  console.log(`\nIMPORTANT: Set redirect URI to: http://localhost:3001/api/platforms/callback/${platform}\n`);

  // Open browser
  const { exec } = await import('child_process');
  exec(`start ${config.url}`);

  const proceed = await question('\nHave you completed the app registration? (y/n): ');

  if (proceed.toLowerCase() === 'y') {
    const clientId = await question('Enter Client ID: ');
    const clientSecret = await question('Enter Client Secret: ');

    if (clientId && clientSecret) {
      await updateEnvFile(platform, clientId.trim(), clientSecret.trim());
      console.log(`\n✅ ${config.name} OAuth setup complete!`);
      return true;
    } else {
      console.log('❌ Missing credentials, skipping...');
      return false;
    }
  } else {
    console.log('⏭️ Skipping...');
    return false;
  }
}

async function setupAll() {
  console.log('🎯 OAuth Setup Wizard - All Platforms\n');
  console.log('This will help you set up OAuth credentials for all platforms.\n');

  const results = {
    success: [],
    skipped: [],
    failed: []
  };

  for (const platform of Object.keys(PLATFORMS)) {
    try {
      const success = await setupPlatform(platform);
      if (success) {
        results.success.push(PLATFORMS[platform].name);
      } else {
        results.skipped.push(PLATFORMS[platform].name);
      }
    } catch (error) {
      console.error(`❌ Error setting up ${PLATFORMS[platform].name}:`, error.message);
      results.failed.push(PLATFORMS[platform].name);
    }

    const continueSetup = await question('\nContinue to next platform? (y/n): ');
    if (continueSetup.toLowerCase() !== 'y') {
      break;
    }
  }

  console.log('\n📊 Setup Summary:');
  console.log(`✅ Success: ${results.success.join(', ') || 'None'}`);
  console.log(`⏭️ Skipped: ${results.skipped.join(', ') || 'None'}`);
  console.log(`❌ Failed: ${results.failed.join(', ') || 'None'}`);

  rl.close();
}

async function main() {
  const args = process.argv.slice(2);
  const platform = args[0];

  if (platform && PLATFORMS[platform]) {
    await setupPlatform(platform);
    rl.close();
  } else if (platform) {
    console.log(`❌ Unknown platform: ${platform}`);
    console.log(`Available platforms: ${Object.keys(PLATFORMS).join(', ')}`);
    rl.close();
  } else {
    await setupAll();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  rl.close();
  process.exit(1);
});
