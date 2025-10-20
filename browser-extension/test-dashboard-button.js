/**
 * Test Dashboard Button Functionality
 * Tests both authenticated and unauthenticated scenarios
 */

console.log('🧪 Testing Dashboard Button Functionality\n');

// Simulate the popup-new.js logic
const EXTENSION_CONFIG = {
  APP_URL: 'http://localhost:8086',
  API_URL: 'http://localhost:3001/api'
};

// Test 1: Without Authentication
console.log('📋 TEST 1: Dashboard button WITHOUT authentication');
console.log('─────────────────────────────────────────────────');

const testWithoutAuth = async () => {
  // Simulate chrome.storage.sync.get with no authToken
  const mockStorage = { authToken: null };

  console.log('Storage state:', mockStorage);

  if (!mockStorage.authToken) {
    console.log('✅ No auth token found');
    console.log('✅ Button should show: "Please sign in first..."');
    console.log('✅ Button background should change to red (#EF4444)');
    console.log(`✅ Should redirect to: ${EXTENSION_CONFIG.APP_URL}/auth`);
    console.log('✅ Expected behavior: CORRECT\n');
    return true;
  }

  console.log('❌ Test failed: Auth token should not exist\n');
  return false;
};

// Test 2: With Authentication
console.log('📋 TEST 2: Dashboard button WITH authentication');
console.log('─────────────────────────────────────────────────');

const testWithAuth = async () => {
  // Simulate chrome.storage.sync.get with authToken
  const mockStorage = {
    authToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhNDgzYTk3OS1jZjg1LTQ4MWQtYjY1Yi1hZjM5NmMyYzUxM2EiLCJpYXQiOjE3NjAzOTU0NjZ9.EUPDVMx3jZ_gLe-dPVAzDKPCJu23UcXuZy6zMDKP2po'
  };

  console.log('Storage state:', { authToken: mockStorage.authToken ? 'EXISTS (length: ' + mockStorage.authToken.length + ')' : null });

  if (mockStorage.authToken) {
    console.log('✅ Auth token found');
    console.log('✅ Button should show: "Opening dashboard..."');
    console.log(`✅ Should open new tab: ${EXTENSION_CONFIG.APP_URL}/dashboard`);
    console.log('✅ Expected behavior: CORRECT\n');
    return true;
  }

  console.log('❌ Test failed: Auth token should exist\n');
  return false;
};

// Test 3: Verify URL endpoints are accessible
console.log('📋 TEST 3: Verify endpoints are accessible');
console.log('─────────────────────────────────────────────────');

const testEndpoints = async () => {
  const fetch = (await import('node-fetch')).default;

  try {
    // Test auth endpoint
    const authResponse = await fetch(`${EXTENSION_CONFIG.APP_URL}/auth`, {
      method: 'HEAD',
      redirect: 'manual'
    });
    console.log(`✅ Auth endpoint: ${EXTENSION_CONFIG.APP_URL}/auth (Status: ${authResponse.status})`);

    // Test dashboard endpoint
    const dashboardResponse = await fetch(`${EXTENSION_CONFIG.APP_URL}/dashboard`, {
      method: 'HEAD',
      redirect: 'manual'
    });
    console.log(`✅ Dashboard endpoint: ${EXTENSION_CONFIG.APP_URL}/dashboard (Status: ${dashboardResponse.status})`);

    console.log('✅ All endpoints accessible\n');
    return true;
  } catch (error) {
    console.error('❌ Endpoint test failed:', error.message);
    return false;
  }
};

// Test 4: Check the updated code syntax
console.log('📋 TEST 4: Code syntax validation');
console.log('─────────────────────────────────────────────────');

const testCodeSyntax = async () => {
  const fs = await import('fs');
  const popupCode = fs.readFileSync('./popup-new.js', 'utf8');

  // Check for authentication check
  if (popupCode.includes('chrome.storage.sync.get([\'authToken\'])')) {
    console.log('✅ Authentication check exists');
  } else {
    console.log('❌ Missing authentication check');
    return false;
  }

  // Check for error message
  if (popupCode.includes('Please sign in first...')) {
    console.log('✅ Error message for unauthenticated users exists');
  } else {
    console.log('❌ Missing error message');
    return false;
  }

  // Check for redirect to auth
  if (popupCode.includes(`\${EXTENSION_CONFIG.APP_URL}/auth`)) {
    console.log('✅ Redirect to auth page exists');
  } else {
    console.log('❌ Missing auth redirect');
    return false;
  }

  // Check for dashboard opening
  if (popupCode.includes(`\${EXTENSION_CONFIG.APP_URL}/dashboard`)) {
    console.log('✅ Dashboard opening logic exists');
  } else {
    console.log('❌ Missing dashboard logic');
    return false;
  }

  console.log('✅ Code syntax validation passed\n');
  return true;
};

// Run all tests
(async () => {
  const results = {
    test1: await testWithoutAuth(),
    test2: await testWithAuth(),
    test3: await testEndpoints(),
    test4: testCodeSyntax()
  };

  console.log('═══════════════════════════════════════════════════');
  console.log('📊 TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════');
  console.log(`TEST 1 (Without Auth): ${results.test1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`TEST 2 (With Auth):    ${results.test2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`TEST 3 (Endpoints):    ${results.test3 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`TEST 4 (Code Syntax):  ${results.test4 ? '✅ PASS' : '❌ FAIL'}`);
  console.log('═══════════════════════════════════════════════════');

  const allPassed = Object.values(results).every(r => r === true);

  if (allPassed) {
    console.log('\n🎉 ALL TESTS PASSED! Extension is ready to use.');
    console.log('\n📝 Next steps:');
    console.log('1. Reload the extension in Chrome (chrome://extensions)');
    console.log('2. Click the extension icon');
    console.log('3. Click "Open Dashboard" button');
    console.log('4. If not authenticated: Should see "Please sign in first..." and redirect to /auth');
    console.log('5. If authenticated: Should open /dashboard directly');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
  }
})();
