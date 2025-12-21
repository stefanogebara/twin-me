const fs = require('fs');
const path = require('path');

console.log('🔧 Integrating Pipedream Gmail OAuth...\n');

// 1. Add backend route to server.js
console.log('1️⃣ Adding backend route to server.js...');
const serverPath = path.join(__dirname, '..', 'api', 'server.js');
let serverContent = fs.readFileSync(serverPath, 'utf8');

if (serverContent.includes('pipedream-gmail')) {
  console.log('   ✅ Backend route already exists - skipping\n');
} else {
  // Add import at top
  const importLine = `import pipedreamGmailRoutes from './routes/pipedream-gmail.js';\n`;
  serverContent = serverContent.replace(
    /(import authRoutes from.*?\n)/,
    `$1${importLine}`
  );

  // Add route registration
  const routeLine = `app.use('/api/pipedream-gmail', pipedreamGmailRoutes);\n`;
  serverContent = serverContent.replace(
    /(app\.use\('\/api\/auth', authRoutes\);\n)/,
    `$1${routeLine}`
  );

  fs.writeFileSync(serverPath, serverContent, 'utf8');
  console.log('   ✅ Added backend route to server.js\n');
}

// 2. Add Gmail OAuth callback route to App.tsx
console.log('2️⃣  Adding Gmail OAuth callback route to App.tsx...');
const appPath = path.join(__dirname, '..', 'src', 'App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');

if (appContent.includes('/oauth/gmail/callback')) {
  console.log('   ✅ Gmail callback route already exists - skipping\n');
} else {
  // Add import
  const gmailCallbackImport = `import GmailCallback from "./pages/oauth/GmailCallback";\n`;
  appContent = appContent.replace(
    /(import WelcomeFlow from.*?\n)/,
    `$1${gmailCallbackImport}`
  );

  // Add route before the onboarding routes
  const gmailCallbackRoute = `            <Route path="/oauth/gmail/callback" element={<GmailCallback />} />\n            `;
  appContent = appContent.replace(
    /(<Route path="\/onboarding" element)/,
    `${gmailCallbackRoute}$1`
  );

  fs.writeFileSync(appPath, appContent, 'utf8');
  console.log('   ✅ Added Gmail OAuth callback route to App.tsx\n');
}

// 3. Update Step4ConnectGmail import in WelcomeFlow.tsx
console.log('3️⃣ Updating Gmail component in WelcomeFlow.tsx...');
const welcomeFlowPath = path.join(__dirname, '..', 'src', 'pages', 'onboarding', 'WelcomeFlow.tsx');
let welcomeFlowContent = fs.readFileSync(welcomeFlowPath, 'utf8');

if (welcomeFlowContent.includes('Step4ConnectGmailNew')) {
  console.log('   ✅ Already using new Gmail component - skipping\n');
} else {
  welcomeFlowContent = welcomeFlowContent.replace(
    /import Step4ConnectGmail from '\.\/Step4ConnectGmail';/,
    `import Step4ConnectGmail from './Step4ConnectGmailNew';`
  );

  fs.writeFileSync(welcomeFlowPath, welcomeFlowContent, 'utf8');
  console.log('   ✅ Updated Gmail component import in WelcomeFlow.tsx\n');
}

console.log('✅ Pipedream Gmail OAuth integration complete!\n');
console.log('📋 Summary:');
console.log('   • Backend route: /api/pipedream-gmail');
console.log('   • Frontend callback: /oauth/gmail/callback');
console.log('   • Gmail component: Step4ConnectGmailNew');
console.log('   • Database methods: upsertPlatformConnection, getPlatformConnection, storeSoulData\n');
console.log('⚙️  Next steps:');
console.log('   1. Add PIPEDREAM_PROJECT_ID to .env');
console.log('   2. Add PIPEDREAM_PROJECT_KEY to .env');
console.log('   3. Add PIPEDREAM_ENVIRONMENT=development to .env');
console.log('   4. Restart dev servers for changes to take effect');
