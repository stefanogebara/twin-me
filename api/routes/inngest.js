/**
 * Inngest Serve Endpoint
 * =======================
 * Registers all Inngest functions with the Inngest platform.
 * This endpoint is called by Inngest to discover and invoke functions.
 *
 * Add new functions by importing them and adding to the serve() array.
 */

import { serve } from 'inngest/express';
import { inngest } from '../services/inngestClient.js';
import { sessionReflectionFunction } from '../inngest/functions/sessionReflection.js';
import { morningBriefingFunction } from '../inngest/functions/morningBriefing.js';

export const inngestHandler = serve({
  client: inngest,
  functions: [
    sessionReflectionFunction,
    morningBriefingFunction,
  ],
});
