// api/utils/logger.js
// Structured logging utility — zero dependencies, production-ready JSON output.
// Usage:
//   import { createLogger } from '../utils/logger.js';
//   const log = createLogger('ServiceName');
//   log.info('message', { key: 'value' });
//   log.error('failed', { error: err });

const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const LEVEL_NAMES = { 10: 'debug', 20: 'info', 30: 'warn', 40: 'error' };

const isProduction = process.env.NODE_ENV === 'production';
const defaultLevel = isProduction ? 'info' : 'debug';
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || defaultLevel] || LOG_LEVELS.debug;

// ====================================================================
// PII Redaction
// ====================================================================
const PII_FIELDS = new Set([
  'email', 'phone', 'token', 'password', 'secret',
  'authorization', 'access_token', 'refresh_token',
  'api_key', 'apikey', 'api-key', 'client_secret',
]);

const REDACTED = '***REDACTED***';

/**
 * Deep-clone an object and replace PII field values with '***REDACTED***'.
 * Works on plain objects and arrays. Primitives pass through unchanged.
 * @param {*} obj - Value to redact
 * @returns {*} New object with PII fields masked
 */
export function redact(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (obj instanceof Error) {
    return { name: obj.name, message: obj.message, ...(obj.code && { code: obj.code }) };
  }
  if (Array.isArray(obj)) return obj.map(item => redact(item));

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase().replace(/[-_]/g, '');
    if (PII_FIELDS.has(key.toLowerCase()) || PII_FIELDS.has(lowerKey)) {
      result[key] = typeof value === 'string' ? REDACTED : value;
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redact(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Format a log entry. JSON in production, human-readable in development.
 */
function formatEntry(level, service, message, context) {
  const entry = {
    level: LEVEL_NAMES[level],
    ts: new Date().toISOString(),
    service,
    msg: message,
  };

  // Auto-redact PII from all context objects before output
  const safeContext = context ? redact(context) : undefined;

  if (safeContext) {
    // Extract error objects specially
    if (safeContext.error instanceof Error) {
      entry.error = {
        name: safeContext.error.name,
        message: safeContext.error.message,
        ...(safeContext.error.code && { code: safeContext.error.code }),
        ...(!isProduction && safeContext.error.stack && { stack: safeContext.error.stack }),
      };
      // Copy remaining context fields
      const { error: _err, ...rest } = safeContext;
      if (Object.keys(rest).length > 0) Object.assign(entry, rest);
    } else {
      Object.assign(entry, safeContext);
    }
  }

  if (isProduction) {
    return JSON.stringify(entry);
  }

  // Development: human-readable with colour hints
  const prefix = {
    debug: '\x1b[90m🔍',    // grey
    info:  '\x1b[36m✅',    // cyan
    warn:  '\x1b[33m⚠️ ',   // yellow
    error: '\x1b[31m❌',    // red
  }[LEVEL_NAMES[level]] || '';
  const reset = '\x1b[0m';

  const contextStr = safeContext
    ? ` ${JSON.stringify(safeContext, replacer, 0)}`
    : '';
  return `${prefix} [${service}]${reset} ${message}${contextStr}`;
}

/** JSON.stringify replacer — handles Error objects inline */
function replacer(_key, value) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, ...(value.code && { code: value.code }) };
  }
  return value;
}

/**
 * Create a namespaced logger instance.
 * @param {string} service - Service/module name (e.g. 'TwinChat', 'MemoryStream')
 * @returns {{ debug, info, warn, error }} Logger methods
 */
export function createLogger(service) {
  const emit = (level, message, context) => {
    if (level < currentLevel) return;
    const formatted = formatEntry(level, service, message, context);
    if (level >= LOG_LEVELS.error) {
      console.error(formatted);
    } else if (level >= LOG_LEVELS.warn) {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  };

  return {
    debug: (msg, ctx) => emit(LOG_LEVELS.debug, msg, ctx),
    info:  (msg, ctx) => emit(LOG_LEVELS.info, msg, ctx),
    warn:  (msg, ctx) => emit(LOG_LEVELS.warn, msg, ctx),
    error: (msg, ctx) => emit(LOG_LEVELS.error, msg, ctx),
  };
}

/**
 * Express request logging middleware.
 * Logs method, path, status code, response time, and user ID.
 */
export function requestLogger() {
  const log = createLogger('HTTP');

  return (req, res, next) => {
    const start = Date.now();

    // Capture when response finishes
    res.on('finish', () => {
      const duration = Date.now() - start;
      const level = res.statusCode >= 500 ? 'error'
        : res.statusCode >= 400 ? 'warn'
        : 'info';

      log[level](`${req.method} ${req.originalUrl} ${res.statusCode}`, {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: duration,
        ...(req.user?.id && { userId: req.user.id }),
        ip: req.ip,
      });
    });

    next();
  };
}

export default { createLogger, requestLogger, redact };
