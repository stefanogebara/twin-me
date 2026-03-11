// api/services/logger.js
// Re-export from canonical location for convenient import paths.
// Usage:
//   import { createLogger, redact } from '../services/logger.js';
//   const log = createLogger('MyService');
//   log.info('event', redact({ email: 'user@example.com' }));

export { createLogger, redact, requestLogger } from '../utils/logger.js';
export { default } from '../utils/logger.js';
