const fs = require('fs');
const path = require('path');

console.log('🔧 Integrating Name Research feature...\n');

// 1. Add backend route to server.js
console.log('1️⃣ Adding name research route to server.js...');
const serverPath = path.join(__dirname, '..', 'api', 'server.js');
let serverContent = fs.readFileSync(serverPath, 'utf8');

if (serverContent.includes('name-research')) {
  console.log('   ✅ Route already exists - skipping\n');
} else {
  // Add import
  const importLine = `import nameResearchRoutes from './routes/name-research.js';\n`;
  serverContent = serverContent.replace(
    /(import pipedreamGmailRoutes from.*?\n)/,
    `$1${importLine}`
  );

  // Add route registration
  const routeLine = `app.use('/api/name-research', nameResearchRoutes);\n`;
  serverContent = serverContent.replace(
    /(app\.use\('\/api\/pipedream-gmail', pipedreamGmailRoutes\);\n)/,
    `$1${routeLine}`
  );

  fs.writeFileSync(serverPath, serverContent, 'utf8');
  console.log('   ✅ Added name research route to server.js\n');
}

console.log('✅ Name Research backend integration complete!\n');
console.log('📋 Summary:');
console.log('   • Backend route: /api/name-research/research');
console.log('   • Uses Claude 3.5 Sonnet with web search');
console.log('   • Returns biographical summary for names\n');
console.log('⚙️  Next: Update frontend component to use the API');
