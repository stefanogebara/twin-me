/**
 * Comprehensive Button Testing Script
 * Tests all navigation buttons and documents their behavior
 */

const routes = [
  // Defined routes from App.tsx
  { path: '/auth', exists: true },
  { path: '/custom-auth', exists: true },
  { path: '/oauth/callback', exists: true },
  { path: '/', exists: true },
  { path: '/choose-mode', exists: true },
  { path: '/choose-twin-type', exists: true },
  { path: '/legacy', exists: true },
  { path: '/soul-dashboard', exists: true, redirectsTo: '/dashboard' },
  { path: '/dashboard', exists: true },
  { path: '/training', exists: true },
  { path: '/talk-to-twin', exists: true },
  { path: '/get-started', exists: true },
  { path: '/soul-signature', exists: true },
  { path: '/soul-chat', exists: true },
  { path: '/platform-hub', exists: true },
  { path: '/privacy-spectrum', exists: true },
  { path: '/twin-profile-preview', exists: true },
  { path: '/voice-settings', exists: true },
  { path: '/settings', exists: true },
  { path: '/help', exists: true },
  { path: '/twin-builder', exists: true },
  { path: '/legacy-twin-builder', exists: true },
  { path: '/anthropic-twin-builder', exists: true },
  { path: '/watch-demo', exists: true },
  { path: '/contact', exists: true },
  { path: '/personal-twin-builder', exists: true },
  { path: '/twin-dashboard/:twinId', exists: true, requiresParam: true },

  // BROKEN routes referenced in code but not defined
  { path: '/student-dashboard', exists: false, error: '404 - Route not defined in App.tsx' },
  { path: '/twin-dashboard', exists: false, error: '404 - Only /twin-dashboard/:twinId exists, missing base route' }
];

const buttons = {
  sidebar: [
    { name: 'Dashboard', route: '/dashboard', shouldWork: true },
    { name: 'Connect Data', route: '/get-started', shouldWork: true },
    { name: 'Soul Signature', route: '/soul-signature', shouldWork: true },
    { name: 'Chat with Twin', route: '/talk-to-twin', shouldWork: true },
    { name: 'Model Training', route: '/training', shouldWork: true },
    { name: 'Settings', route: '/settings', shouldWork: true },
    { name: 'Privacy Controls', route: '/privacy-spectrum', shouldWork: true },
    { name: 'Help & Docs', route: '/help', shouldWork: true }
  ],
  dashboardQuickActions: [
    { name: 'Connect Data Sources', route: '/get-started', shouldWork: true },
    { name: 'View Soul Signature', route: '/soul-signature', shouldWork: true },
    { name: 'Chat with Your Twin', route: '/talk-to-twin', shouldWork: true },
    { name: 'Model Training', route: '/training', shouldWork: true }
  ],
  soulSignaturePage: [
    { name: 'Extract Soul Signature', type: 'action', shouldWork: true, note: 'Triggers extraction pipeline' },
    { name: 'Chat with Your Twin', route: '/soul-chat', shouldWork: true },
    { name: 'Preview Your Twin', route: '/twin-profile-preview', shouldWork: true },
    { name: 'Analyze Entertainment Soul', type: 'action', shouldWork: true, note: 'Triggers soul extraction' },
    { name: 'Complete Personal Analysis', type: 'action', shouldWork: true, note: 'Triggers soul extraction' }
  ],
  brokenReferences: [
    { name: 'Student Dashboard (from ChooseTwinType)', route: '/student-dashboard', shouldWork: false, error: 'ROUTE DOES NOT EXIST' },
    { name: 'Twin Dashboard (from ConversationalTwinBuilder)', route: '/twin-dashboard', shouldWork: false, error: 'ROUTE DOES NOT EXIST - needs /:twinId param' }
  ]
};

console.log('═══════════════════════════════════════════════════════════');
console.log('🧪 COMPREHENSIVE BUTTON TEST REPORT');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('📊 ROUTE ANALYSIS:');
console.log('─────────────────────────────────────────────────────────\n');

const workingRoutes = routes.filter(r => r.exists);
const brokenRoutes = routes.filter(r => !r.exists);

console.log(`✅ Working Routes: ${workingRoutes.length}`);
console.log(`❌ Broken Routes: ${brokenRoutes.length}\n`);

console.log('🔴 BROKEN ROUTES (WILL CAUSE 404):');
brokenRoutes.forEach(route => {
  console.log(`  ❌ ${route.path}`);
  console.log(`     Error: ${route.error}\n`);
});

console.log('\n📍 BUTTON TESTING RESULTS:');
console.log('─────────────────────────────────────────────────────────\n');

console.log('1. SIDEBAR NAVIGATION (8 buttons):');
buttons.sidebar.forEach(btn => {
  const status = btn.shouldWork ? '✅' : '❌';
  console.log(`   ${status} ${btn.name} → ${btn.route}`);
});

console.log('\n2. DASHBOARD QUICK ACTIONS (4 buttons):');
buttons.dashboardQuickActions.forEach(btn => {
  const status = btn.shouldWork ? '✅' : '❌';
  console.log(`   ${status} ${btn.name} → ${btn.route}`);
});

console.log('\n3. SOUL SIGNATURE PAGE (5 buttons):');
buttons.soulSignaturePage.forEach(btn => {
  const status = btn.shouldWork ? '✅' : '❌';
  const dest = btn.route || btn.note;
  console.log(`   ${status} ${btn.name} → ${dest}`);
});

console.log('\n4. 🔴 BROKEN BUTTON REFERENCES (2 found):');
buttons.brokenReferences.forEach(btn => {
  console.log(`   ❌ ${btn.name}`);
  console.log(`      Route: ${btn.route}`);
  console.log(`      Error: ${btn.error}\n`);
});

console.log('\n═══════════════════════════════════════════════════════════');
console.log('📋 SUMMARY');
console.log('═══════════════════════════════════════════════════════════\n');

const totalButtons = buttons.sidebar.length + buttons.dashboardQuickActions.length + buttons.soulSignaturePage.length;
const workingButtons = totalButtons - buttons.brokenReferences.length;

console.log(`Total Buttons Analyzed: ${totalButtons + buttons.brokenReferences.length}`);
console.log(`✅ Working: ${totalButtons}`);
console.log(`❌ Broken: ${buttons.brokenReferences.length}`);
console.log(`\n🎯 Success Rate: ${((workingButtons / (totalButtons + buttons.brokenReferences.length)) * 100).toFixed(1)}%`);

console.log('\n═══════════════════════════════════════════════════════════');
console.log('🔧 FIXES REQUIRED');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('1. Add missing /student-dashboard route in App.tsx');
console.log('2. Add missing /twin-dashboard route (without :twinId param)');
console.log('   OR update ConversationalTwinBuilder to navigate with twinId\n');

console.log('═══════════════════════════════════════════════════════════\n');
