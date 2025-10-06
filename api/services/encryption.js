/**
 * AES-256-GCM Token Encryption Service
 * Uses authenticated encryption to protect OAuth tokens
 *
 * IMPORTANT: Generate encryption key with:
 * node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Add to .env:
 * ENCRYPTION_KEY=your_64_character_hex_string_here
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

// Get encryption key from environment
let encryptionKey;
try {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY not set in environment variables');
  }

  encryptionKey = Buffer.from(keyHex, 'hex');

  if (encryptionKey.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex characters)`);
  }
} catch (error) {
  console.error('❌ Encryption setup failed:', error.message);
  console.error('💡 Generate a key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  // Don't call process.exit() in serverless environments - throw error instead
  throw new Error(`Encryption initialization failed: ${error.message}`);
}

/**
 * Encrypt a token using AES-256-GCM
 * @param {string} plaintext - The token to encrypt
 * @returns {string} - Encrypted data in format: iv:authTag:ciphertext (all hex)
 */
export function encryptToken(plaintext) {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty token');
  }

  try {
    // Generate random IV for this encryption
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);

    // Encrypt the plaintext
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Return in format: iv:authTag:ciphertext (all hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
  } catch (error) {
    console.error('Token encryption error:', error);
    throw new Error('Failed to encrypt token');
  }
}

/**
 * Decrypt a token using AES-256-GCM
 * @param {string} encryptedData - Encrypted data in format: iv:authTag:ciphertext
 * @returns {string} - Decrypted plaintext token
 */
export function decryptToken(encryptedData) {
  if (!encryptedData) {
    throw new Error('Cannot decrypt empty data');
  }

  try {
    // Parse the encrypted data format
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivHex, authTagHex, ciphertext] = parts;

    // Convert from hex
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    // Validate lengths
    if (iv.length !== IV_LENGTH) {
      throw new Error('Invalid IV length');
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error('Invalid auth tag length');
    }

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(authTag);

    // Decrypt the ciphertext
    let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  } catch (error) {
    console.error('Token decryption error:', error.message);
    throw new Error('Failed to decrypt token - data may be corrupted or key mismatch');
  }
}

/**
 * Test the encryption/decryption functions
 * @returns {boolean} - True if test passes
 */
export function testEncryption() {
  try {
    const testToken = 'test_access_token_12345';
    const encrypted = encryptToken(testToken);
    const decrypted = decryptToken(encrypted);

    if (decrypted !== testToken) {
      throw new Error('Encryption test failed: decrypted text does not match original');
    }

    console.log('✅ Encryption test passed');
    return true;
  } catch (error) {
    console.error('❌ Encryption test failed:', error.message);
    return false;
  }
}

/**
 * Securely hash a password using bcrypt
 * (Convenience function for auth routes)
 */
export async function hashPassword(password) {
  const bcrypt = await import('bcrypt');
  return bcrypt.hash(password, 10);
}

/**
 * Verify a password against a hash
 * (Convenience function for auth routes)
 */
export async function verifyPassword(password, hash) {
  const bcrypt = await import('bcrypt');
  return bcrypt.compare(password, hash);
}

// Run self-test on module load (only in development)
if (process.env.NODE_ENV === 'development') {
  testEncryption();
}

export default {
  encryptToken,
  decryptToken,
  testEncryption,
  hashPassword,
  verifyPassword
};
