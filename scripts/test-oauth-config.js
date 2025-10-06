/**
 * OAuth Configuration Test Script
 * Run this to verify your OAuth credentials are properly configured
 */

import dotenv from 'dotenv';
dotenv.config();

const platforms = {
  spotify: {
    name: 'Spotify',
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI,
    docs: 'https://developer.spotify.com/dashboard'
  },
  github: {
    name: 'GitHub',
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    redirectUri: process.env.GITHUB_REDIRECT_URI,
    docs: 'https://github.com/settings/developers'
  },
  discord: {
    name: 'Discord',
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    redirectUri: process.env.DISCORD_REDIRECT_URI,
    docs: 'https://discord.com/developers/applications'
  },
  linkedin: {
    name: 'LinkedIn',
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    redirectUri: process.env.LINKEDIN_REDIRECT_URI,
    docs: 'https://www.linkedin.com/developers/apps'
  },
  slack: {
    name: 'Slack',
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    redirectUri: process.env.SLACK_REDIRECT_URI,
    docs: 'https://api.slack.com/apps'
  },
  google: {
    name: 'Google (YouTube/Gmail)',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    apiKey: process.env.YOUTUBE_API_KEY,
    docs: 'https://console.cloud.google.com'
  }
};

console.log('\n🔍 OAuth Configuration Check\n');
console.log('='.repeat(60));

let allGood = true;
let needsUpdate = [];

Object.entries(platforms).forEach(([key, config]) => {
  console.log(`\n${config.name}:`);
  
  // Check Client ID
  if (config.clientId && config.clientId !== 'your-client-id-here') {
    console.log(`  ✅ Client ID: ${config.clientId.substring(0, 20)}...`);
  } else {
    console.log(`  ❌ Client ID: Missing or placeholder`);
    allGood = false;
  }
  
  // Check Client Secret
  if (config.clientSecret && !config.clientSecret.includes('your-') && !config.clientSecret.includes('here')) {
    console.log(`  ✅ Client Secret: ${config.clientSecret.substring(0, 20)}...`);
  } else {
    console.log(`  ❌ Client Secret: Missing or placeholder`);
    allGood = false;
  }
  
  // Check Redirect URI
  if (config.redirectUri) {
    if (config.redirectUri.includes('127.0.0.1')) {
      console.log(`  ✅ Redirect URI: ${config.redirectUri}`);
    } else if (config.redirectUri.includes('localhost')) {
      console.log(`  ⚠️  Redirect URI: ${config.redirectUri}`);
      console.log(`     → Should use 127.0.0.1 instead of localhost`);
      needsUpdate.push(config.name);
    } else {
      console.log(`  ⚠️  Redirect URI: ${config.redirectUri}`);
      console.log(`     → Should be: http://127.0.0.1:3001/api/oauth/callback/${key}`);
      needsUpdate.push(config.name);
    }
  } else {
    console.log(`  ❌ Redirect URI: Not configured`);
    allGood = false;
  }
  
  // Check API Key for Google
  if (key === 'google') {
    if (config.apiKey && config.apiKey !== 'your-youtube-api-key-here') {
      console.log(`  ✅ YouTube API Key: ${config.apiKey.substring(0, 20)}...`);
    } else {
      console.log(`  ⚠️  YouTube API Key: Not set (optional but recommended)`);
    }
  }
  
  console.log(`  📚 Docs: ${config.docs}`);
});

console.log('\n' + '='.repeat(60));
console.log('\n📊 Summary:\n');

if (allGood && needsUpdate.length === 0) {
  console.log('✅ All platforms configured correctly!\n');
  console.log('Next steps:');
  console.log('  1. Make sure redirect URIs are updated in each platform dashboard');
  console.log('  2. Restart your backend server: npm run server:dev');
  console.log('  3. Test OAuth flow: http://127.0.0.1:8086/get-started\n');
} else {
  if (!allGood) {
    console.log('❌ Some credentials are missing or using placeholders\n');
  }
  
  if (needsUpdate.length > 0) {
    console.log('⚠️  These platforms need redirect URI updates:\n');
    needsUpdate.forEach(name => {
      console.log(`  - ${name}: Update to use 127.0.0.1 instead of localhost`);
    });
    console.log('\n  → See OAUTH_REDIRECT_CHECKLIST.md for instructions\n');
  }
}

// Check app URLs
console.log('🌐 App Configuration:\n');
console.log(`  Frontend URL: ${process.env.VITE_APP_URL || 'Not set'}`);
console.log(`  Backend URL:  ${process.env.VITE_API_URL || 'Not set'}`);

if (process.env.VITE_APP_URL?.includes('localhost') || process.env.VITE_API_URL?.includes('localhost')) {
  console.log('\n  ⚠️  URLs should use 127.0.0.1 instead of localhost for 2025 OAuth compliance');
}

console.log('\n' + '='.repeat(60) + '\n');
