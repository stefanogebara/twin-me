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
import { createLogger } from './logger.js';

const log = createLogger('Encryption');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

// Lazy-load encryption key to allow dotenv.config() to run first
let encryptionKey;

function getEncryptionKey() {
  if (!encryptionKey) {
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
      log.error('Encryption setup failed', { error: error.message });
      log.error('Generate a key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
      throw new Error(`Encryption initialization failed: ${error.message}`);
    }
  }
  return encryptionKey;
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
    const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

    // Encrypt the plaintext
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Return in format: iv:authTag:ciphertext (all hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
  } catch (error) {
    log.error('Token encryption error', { error });
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
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);

    // Decrypt the ciphertext
    let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  } catch (error) {
    log.error('Token decryption error', { error: error.message });
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

    log.info('Encryption test passed');
    return true;
  } catch (error) {
    log.error('Encryption test failed', { error: error.message });
    return false;
  }
}

/**
 * Securely hash a password using bcrypt
 * (Convenience function for auth routes)
 */
export async function hashPassword(password) {
  const bcrypt = await import('bcrypt');
  return bcrypt.hash(password, 12);
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


/**
 * Encrypt OAuth state parameter with flow type prefix.
 * The prefix allows the frontend to route to the correct callback
 * endpoint without needing to decrypt the state.
 *
 * @param {string|object} state - State to encrypt (object will be JSON.stringified)
 * @param {string} flowType - OAuth flow type prefix: 'auth', 'arctic', 'connector', 'entertainment', 'health'
 * @returns {string} - Prefixed encrypted state (e.g. "auth.iv:encrypted:tag")
 */
export function encryptState(state, flowType = 'connector') {
  const stateString = typeof state === 'object' ? JSON.stringify(state) : state;
  const encrypted = encryptToken(stateString);
  return `${flowType}.${encrypted}`;
}

/**
 * Decrypt OAuth state parameter, stripping flow type prefix if present.
 * @param {string} encryptedState - Encrypted state (optionally prefixed with flow type)
 * @param {boolean} parseJson - If true, parse the decrypted string as JSON (default: true)
 * @returns {string|object} - Decrypted state
 */
export function decryptState(encryptedState, parseJson = true) {
  // Strip flow type prefix if present (e.g. "auth.iv:encrypted:tag" → "iv:encrypted:tag")
  let stateStr = encryptedState;
  const dotIdx = stateStr.indexOf('.');
  if (dotIdx > 0 && dotIdx < 20) {
    stateStr = stateStr.substring(dotIdx + 1);
  }
  const decrypted = decryptToken(stateStr);
  if (parseJson) {
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted; // Return as string if not valid JSON
    }
  }
  return decrypted;
}

export default {
  encryptToken,
  decryptToken,
  testEncryption,
  hashPassword,
  verifyPassword
};
