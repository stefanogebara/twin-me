/**
 * Inngest Serve Endpoint
 * =======================
 * Registers all Inngest functions with the Inngest platform.
 * Uses lazy initialization to avoid URL errors at import time.
 */

import express from 'express';
import { serve } from 'inngest/express';
import { inngest } from '../services/inngestClient.js';
import { sessionReflectionFunction } from '../inngest/functions/sessionReflection.js';
import { morningBriefingFunction } from '../inngest/functions/morningBriefing.js';
import { musicMoodMatchFunction } from '../inngest/functions/musicMoodMatch.js';
import { eveningRecapFunction } from '../inngest/functions/eveningRecap.js';
import { emailTriageFunction } from '../inngest/functions/emailTriage.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('InngestRoute');
const router = express.Router();

let handler = null;

function getHandler() {
  if (!handler) {
    try {
      handler = serve({
        client: inngest,
        functions: [
          sessionReflectionFunction,
          morningBriefingFunction,
          musicMoodMatchFunction,
          eveningRecapFunction,
          emailTriageFunction,
        ],
      });
      log.info('Inngest handler initialized');
    } catch (err) {
      log.error('Failed to initialize Inngest handler', { error: err.message });
      return null;
    }
  }
  return handler;
}

router.use((req, res, next) => {
  const h = getHandler();
  if (!h) {
    return res.status(503).json({ error: 'Inngest handler not available' });
  }
  return h(req, res, next);
});

export default router;
