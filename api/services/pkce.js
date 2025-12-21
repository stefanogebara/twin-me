/**
 * PKCE (Proof Key for Code Exchange) Utility
 *
 * Implements RFC 7636 - PKCE for OAuth 2.0 public clients
 * Prevents authorization code interception attacks
 *
 * Security:
 * - code_verifier: 43-128 characters, cryptographically random
 * - code_challenge: SHA256 hash of code_verifier, base64url encoded
 * - Mandatory for OAuth 2.1 compliance
 */

import crypto from 'crypto';

/**
 * Generates a cryptographically secure code verifier
 *
 * Per RFC 7636:
 * - Length: 43-128 characters
 * - Characters: [A-Z], [a-z], [0-9], "-", ".", "_", "~"
 * - Encoding: base64url (URL-safe base64 without padding)
 * - Minimum entropy: 256 bits
 *
 * @returns {string} Base64url-encoded code verifier (43 characters from 32 bytes)
 */
export function generateCodeVerifier() {
  // Generate 32 random bytes (256 bits of entropy)
  const verifier = crypto.randomBytes(32)
    .toString('base64url'); // URL-safe base64 without padding

  return verifier; // Results in 43 characters
}

/**
 * Generates a code challenge from a code verifier
 *
 * Per RFC 7636:
 * - Method: S256 (SHA256 hash, required)
 * - Encoding: base64url
 * - "plain" method is deprecated and insecure
 *
 * @param {string} codeVerifier - The code verifier to hash
 * @returns {string} Base64url-encoded SHA256 hash of code verifier
 */
export function generateCodeChallenge(codeVerifier) {
  // Create SHA256 hash of the code verifier
  const hash = crypto.createHash('sha256')
    .update(codeVerifier)
    .digest('base64url'); // URL-safe base64 without padding

  return hash;
}

/**
 * Validates a code verifier format
 *
 * @param {string} codeVerifier - Code verifier to validate
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidCodeVerifier(codeVerifier) {
  if (!codeVerifier || typeof codeVerifier !== 'string') {
    return false;
  }

  // Must be 43-128 characters (RFC 7636)
  if (codeVerifier.length < 43 || codeVerifier.length > 128) {
    return false;
  }

  // Must only contain base64url characters
  const base64urlRegex = /^[A-Za-z0-9_-]+$/;
  return base64urlRegex.test(codeVerifier);
}

/**
 * Generates a complete PKCE parameter set
 *
 * Usage in OAuth flow:
 * 1. Generate parameters
 * 2. Store code_verifier securely (encrypted)
 * 3. Send code_challenge + code_challenge_method to authorization endpoint
 * 4. Send code_verifier to token endpoint
 *
 * @returns {Object} PKCE parameters
 * @returns {string} .codeVerifier - Store this encrypted in database
 * @returns {string} .codeChallenge - Send this to authorization endpoint
 * @returns {string} .codeChallengeMethod - Always "S256"
 */
export function generatePKCEParams() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256' // Required by OAuth 2.1
  };
}

/**
 * Example usage:
 *
 * // Authorization step
 * const pkce = generatePKCEParams();
 * await storeCodeVerifier(pkce.codeVerifier); // Store encrypted
 * const authUrl = `${authEndpoint}?code_challenge=${pkce.codeChallenge}&code_challenge_method=S256`;
 *
 * // Token exchange step
 * const storedVerifier = await retrieveCodeVerifier();
 * const tokenResponse = await fetch(tokenEndpoint, {
 *   body: new URLSearchParams({
 *     code: authorizationCode,
 *     code_verifier: storedVerifier // OAuth provider validates this
 *   })
 * });
 */

export default {
  generateCodeVerifier,
  generateCodeChallenge,
  generatePKCEParams,
  isValidCodeVerifier
};
