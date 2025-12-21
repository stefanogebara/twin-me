/**
 * Test JWT Secret Validation
 * This script tests the JWT secret validation logic
 */

import { validateSecret } from './api/utils/generateSecret.js';

console.log('\n🔍 Testing JWT Secret Validation\n');
console.log('='.repeat(60));

// Test cases
const testCases = [
  {
    name: 'Empty secret',
    secret: '',
    shouldPass: false
  },
  {
    name: 'Undefined secret',
    secret: undefined,
    shouldPass: false
  },
  {
    name: 'Common insecure default 1',
    secret: 'your-secret-key',
    shouldPass: false
  },
  {
    name: 'Common insecure default 2',
    secret: 'your-secret-key-change-this-in-production',
    shouldPass: false
  },
  {
    name: 'Too short (less than 32 chars)',
    secret: 'short123',
    shouldPass: false
  },
  {
    name: 'Low entropy (repeated chars)',
    secret: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    shouldPass: false
  },
  {
    name: 'Valid secure secret (current .env)',
    secret: 'w_hzTXT3rD2anee19-p7whr5k1_6p6WotPDbpoB9TJQ',
    shouldPass: true
  }
];

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const result = validateSecret(testCase.secret);
  const testPassed = result.valid === testCase.shouldPass;

  if (testPassed) {
    console.log(`✅ PASS: ${testCase.name}`);
    console.log(`   Expected: ${testCase.shouldPass ? 'valid' : 'invalid'}`);
    console.log(`   Result: ${result.message}\n`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${testCase.name}`);
    console.log(`   Expected: ${testCase.shouldPass ? 'valid' : 'invalid'}`);
    console.log(`   Got: ${result.valid ? 'valid' : 'invalid'}`);
    console.log(`   Message: ${result.message}\n`);
    failed++;
  }
}

console.log('='.repeat(60));
console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

if (failed === 0) {
  console.log('✅ All tests passed! JWT validation is working correctly.\n');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Please review the validation logic.\n');
  process.exit(1);
}
