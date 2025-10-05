/**
 * Unicode Sanitizer Utility
 * Fixes broken Unicode surrogate pairs that cause JSON serialization errors
 * when sending data to the Anthropic API
 */

/**
 * Sanitize a string by removing or fixing broken Unicode surrogate pairs
 * @param {string} str - The string to sanitize
 * @returns {string} - Sanitized string safe for JSON serialization
 */
export function sanitizeUnicode(str) {
  if (typeof str !== 'string') {
    return str;
  }

  try {
    // Replace broken surrogate pairs with replacement character
    // This regex matches unpaired surrogates
    return str.replace(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g,
      '\uFFFD' // Unicode replacement character
    );
  } catch (error) {
    console.error('Error sanitizing Unicode:', error);
    // Fallback: remove all non-BMP characters if sanitization fails
    return str.replace(/[\uD800-\uDFFF]/g, '');
  }
}

/**
 * Sanitize all string values in an object recursively
 * @param {any} obj - The object to sanitize
 * @returns {any} - Sanitized object
 */
export function sanitizeObject(obj) {
  if (typeof obj === 'string') {
    return sanitizeUnicode(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (obj && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Safely stringify JSON with Unicode sanitization
 * @param {any} data - Data to stringify
 * @returns {string} - JSON string safe for transmission
 */
export function safeJsonStringify(data) {
  try {
    // First sanitize the entire object
    const sanitized = sanitizeObject(data);
    // Then stringify
    return JSON.stringify(sanitized);
  } catch (error) {
    console.error('Error in safeJsonStringify:', error);
    throw new Error(`Failed to stringify data: ${error.message}`);
  }
}

/**
 * Validate that a string can be safely JSON stringified
 * @param {string} str - String to validate
 * @returns {boolean} - True if safe, false otherwise
 */
export function isJsonSafe(str) {
  try {
    JSON.stringify({ test: str });
    return true;
  } catch (error) {
    return false;
  }
}

export default {
  sanitizeUnicode,
  sanitizeObject,
  safeJsonStringify,
  isJsonSafe
};
