/**
 * Secure JWT Secret Generator Utility
 *
 * This utility generates cryptographically secure random secrets for JWT signing.
 * Run this script to generate a new JWT secret for your environment.
 *
 * SECURITY REQUIREMENTS:
 * - Minimum 32 bytes (256 bits) of entropy
 * - Cryptographically random using crypto.randomBytes
 * - Base64url encoded for safe storage in environment variables
 * - Different secrets for development, staging, and production
 *
 * USAGE:
 *   node api/utils/generateSecret.js
 *   node api/utils/generateSecret.js --bytes 64  # For 512-bit secret
 */

import crypto from 'crypto';

/**
 * Generate a cryptographically secure random secret
 * @param {number} bytes - Number of random bytes (default: 32 for 256-bit)
 * @returns {string} Base64url-encoded secret
 */
export function generateSecret(bytes = 32) {
  if (bytes < 32) {
    throw new Error('Secret must be at least 32 bytes (256 bits) for security');
  }

  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Validate that a JWT secret meets security requirements
 * @param {string} secret - The secret to validate
 * @returns {object} Validation result with 'valid' boolean and 'message'
 */
export function validateSecret(secret) {
  if (!secret) {
    return {
      valid: false,
      message: 'JWT_SECRET is not set'
    };
  }

  if (typeof secret !== 'string') {
    return {
      valid: false,
      message: 'JWT_SECRET must be a string'
    };
  }

  // Check for common insecure defaults
  const insecureDefaults = [
    'your-secret-key',
    'your-secret-key-here',
    'your-secret-key-change-this',
    'your-secret-key-change-this-in-production',
    'change-this',
    'secret',
    'jwt-secret',
    'your_jwt_secret_here_change_this_in_production',
    'make_it_random_and_secure'
  ];

  const lowerSecret = secret.toLowerCase();
  for (const insecure of insecureDefaults) {
    if (lowerSecret.includes(insecure)) {
      return {
        valid: false,
        message: `JWT_SECRET contains insecure default value: "${insecure}". Generate a new secret.`
      };
    }
  }

  // Check minimum length (should be at least 32 characters)
  if (secret.length < 32) {
    return {
      valid: false,
      message: `JWT_SECRET is too short (${secret.length} characters). Must be at least 32 characters.`
    };
  }

  // Warn if secret appears to be low entropy (all same character, simple pattern, etc.)
  const uniqueChars = new Set(secret).size;
  if (uniqueChars < 16) {
    return {
      valid: false,
      message: `JWT_SECRET has low entropy (only ${uniqueChars} unique characters). Generate a cryptographically random secret.`
    };
  }

  return {
    valid: true,
    message: 'JWT_SECRET meets security requirements'
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);
  let bytes = 32; // Default to 256-bit

  // Parse --bytes argument
  const bytesIndex = args.indexOf('--bytes');
  if (bytesIndex !== -1 && args[bytesIndex + 1]) {
    bytes = parseInt(args[bytesIndex + 1], 10);
    if (isNaN(bytes) || bytes < 32) {
      console.error('❌ Error: --bytes must be a number >= 32');
      process.exit(1);
    }
  }

  console.log('\n🔐 JWT Secret Generator\n');
  console.log('━'.repeat(60));

  const secret = generateSecret(bytes);
  const validation = validateSecret(secret);

  console.log('\n✅ Generated secure JWT secret:\n');
  console.log(`   ${secret}\n`);
  console.log('━'.repeat(60));
  console.log('\n📝 Add this to your .env file:\n');
  console.log(`   JWT_SECRET=${secret}\n`);
  console.log('━'.repeat(60));
  console.log('\n⚠️  SECURITY REMINDERS:\n');
  console.log('   1. NEVER commit this secret to version control');
  console.log('   2. Use DIFFERENT secrets for dev/staging/prod');
  console.log('   3. Rotate secrets periodically (every 90 days recommended)');
  console.log('   4. Store production secrets in secure vault (Vercel, AWS Secrets Manager, etc.)');
  console.log('   5. If compromised, generate new secret immediately\n');
  console.log('━'.repeat(60));
  console.log(`\n🔍 Validation: ${validation.message}`);
  console.log(`📊 Entropy: ${bytes * 8} bits (${bytes} bytes)\n`);
}
