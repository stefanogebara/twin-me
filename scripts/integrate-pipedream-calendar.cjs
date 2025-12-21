const fs = require('fs');
const path = require('path');

console.log('🔧 Integrating Pipedream Calendar feature...\n');

// 1. Add backend route to server.js
console.log('1️⃣ Adding calendar route to server.js...');
const serverPath = path.join(__dirname, '..', 'api', 'server.js');
let serverContent = fs.readFileSync(serverPath, 'utf8');

if (serverContent.includes('pipedream-calendar')) {
  console.log('   ✅ Route already exists - skipping\n');
} else {
  // Add import
  const importLine = `import pipedreamCalendarRoutes from './routes/pipedream-calendar.js';\n`;
  serverContent = serverContent.replace(
    /(import pipedreamGmailRoutes from.*?\n)/,
    `$1${importLine}`
  );

  // Add route registration
  const routeLine = `app.use('/api/pipedream-calendar', pipedreamCalendarRoutes);\n`;
  serverContent = serverContent.replace(
    /(app\.use\('\/api\/pipedream-gmail', pipedreamGmailRoutes\);\n)/,
    `$1${routeLine}`
  );

  fs.writeFileSync(serverPath, serverContent, 'utf8');
  console.log('   ✅ Added calendar route to server.js\n');
}

console.log('✅ Pipedream Calendar backend integration complete!\n');
console.log('📋 Summary:');
console.log('   • Backend route: /api/pipedream-calendar/*');
console.log('   • OAuth endpoint: POST /api/pipedream-calendar/connect');
console.log('   • Callback endpoint: POST /api/pipedream-calendar/callback');
console.log('   • Extract endpoint: POST /api/pipedream-calendar/extract');
console.log('   • Status endpoint: GET /api/pipedream-calendar/status');
console.log('   • Disconnect endpoint: DELETE /api/pipedream-calendar/disconnect');
console.log('\n⚙️  Features:');
console.log('   • Pipedream Connect OAuth flow');
console.log('   • Google Calendar API integration');
console.log('   • Calendar pattern extraction (30-day history)');
console.log('   • Claude AI analysis (work-life balance, scheduling style)');
console.log('   • Privacy-preserving pattern analysis\n');
