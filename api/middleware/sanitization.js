import DOMPurify from 'isomorphic-dompurify';
import xss from 'xss';

// Comprehensive input sanitization middleware
const sanitizeInput = (req, res, next) => {
  try {
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize URL parameters
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    console.error('Input sanitization error:', error);
    return res.status(400).json({
      error: 'Invalid input data',
      message: 'Input contains potentially harmful content'
    });
  }
};

// Recursive object sanitization
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return sanitizeValue(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    // Sanitize the key itself
    const cleanKey = sanitizeValue(key, { allowHTML: false });
    sanitized[cleanKey] = sanitizeObject(value);
  }

  return sanitized;
}

// Sanitize individual values
function sanitizeValue(value, options = {}) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  // Remove null bytes and control characters
  value = value.replace(/\x00/g, '').replace(/[\x00-\x1F\x7F]/g, '');

  // Basic XSS protection
  if (!options.allowHTML) {
    value = xss(value, {
      whiteList: {}, // No HTML tags allowed
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script']
    });
  }

  // SQL injection basic protection (escape single quotes)
  value = value.replace(/'/g, "''");

  // Remove potential NoSQL injection patterns
  value = value.replace(/[\$\{\}]/g, '');

  // Limit length to prevent DoS
  if (value.length > 10000) {
    value = value.substring(0, 10000);
  }

  return value.trim();
}

// Strict sanitization for critical fields (like database queries)
const strictSanitize = (req, res, next) => {
  try {
    // Apply extra strict rules for database-related endpoints
    if (req.body) {
      // Remove any potential SQL keywords from user input
      const sqlKeywords = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT|JAVASCRIPT|VBSCRIPT|ONLOAD|ONERROR)\b/gi;

      const sanitizeStrict = (obj) => {
        if (typeof obj === 'string') {
          return obj.replace(sqlKeywords, '').replace(/[<>'"]/g, '');
        }
        if (Array.isArray(obj)) {
          return obj.map(sanitizeStrict);
        }
        if (obj && typeof obj === 'object') {
          const result = {};
          for (const [key, value] of Object.entries(obj)) {
            result[key] = sanitizeStrict(value);
          }
          return result;
        }
        return obj;
      };

      req.body = sanitizeStrict(req.body);
    }

    next();
  } catch (error) {
    console.error('Strict sanitization error:', error);
    return res.status(400).json({
      error: 'Input validation failed',
      message: 'Contains prohibited content'
    });
  }
};

// Rate limiting per endpoint type
const endpointRateLimit = (maxRequests, windowMs, errorMessage) => {
  const requests = new Map();

  return (req, res, next) => {
    const key = `${req.ip}:${req.originalUrl}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get or initialize request log for this key
    let requestLog = requests.get(key) || [];

    // Filter out old requests
    requestLog = requestLog.filter(timestamp => timestamp > windowStart);

    if (requestLog.length >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        message: errorMessage || 'Rate limit exceeded for this endpoint',
        retryAfter: Math.ceil((requestLog[0] + windowMs - now) / 1000)
      });
    }

    // Add current request
    requestLog.push(now);
    requests.set(key, requestLog);

    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance
      const cutoff = now - windowMs * 2;
      for (const [k, log] of requests.entries()) {
        const filtered = log.filter(timestamp => timestamp > cutoff);
        if (filtered.length === 0) {
          requests.delete(k);
        } else {
          requests.set(k, filtered);
        }
      }
    }

    next();
  };
};

// Content-Type validation middleware
const validateContentType = (allowedTypes = ['application/json']) => {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
      return next(); // Skip validation for GET and DELETE
    }

    const contentType = req.headers['content-type'];

    if (!contentType) {
      return res.status(400).json({
        error: 'Missing Content-Type header'
      });
    }

    const isAllowed = allowedTypes.some(type => contentType.includes(type));

    if (!isAllowed) {
      return res.status(415).json({
        error: 'Unsupported Media Type',
        message: `Content-Type must be one of: ${allowedTypes.join(', ')}`
      });
    }

    next();
  };
};

export {
  sanitizeInput,
  strictSanitize,
  endpointRateLimit,
  validateContentType
};