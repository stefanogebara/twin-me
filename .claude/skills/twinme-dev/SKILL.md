---
name: twinme-dev
description: TwinMe development patterns for memory stream services, platform integrations, API endpoints, and twin chat context. Use when creating new backend services, API routes, or platform connectors.
user-invocable: false
---

# TwinMe Development Patterns

## Backend Service Pattern

All backend services follow this structure:

```javascript
// api/services/newService.js
import { supabaseAdmin } from './database.js';
import { complete, TIER_ANALYSIS } from './llmGateway.js';

export async function myFunction(userId) {
  // 1. Always validate userId
  if (!userId) throw new Error('userId required');
  
  // 2. Use supabaseAdmin for server-side queries
  const { data, error } = await supabaseAdmin
    .from('table_name')
    .select('*')
    .eq('user_id', userId);
  
  if (error) throw error;
  return data;
}
```

## API Route Pattern

```javascript
// api/routes/newRoute.js
import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();
router.use(authenticateUser);

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id; // From JWT (payload.id || payload.userId)
    const data = await myFunction(userId);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[Route] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

Register in `api/server.js`: `app.use('/api/newroute', newRoutes);`

## Frontend API Client Pattern

```typescript
// src/services/api/newAPI.ts
import { authFetch } from './apiBase';

// IMPORTANT: Paths start with / (no /api prefix - VITE_API_URL already includes it)
export const newAPI = {
  getItems: async (): Promise<Item[]> => {
    const response = await authFetch('/items');
    if (!response.ok) throw new Error(`Failed: ${response.statusText}`);
    const data = await response.json();
    return data.data ?? [];
  },
};
```

## Memory Stream Integration

When a new service needs to store observations:

```javascript
// addMemory takes POSITIONAL args (userId, content, memoryType, metadata) —
// passing an options object stores "[object Object]" as the memory content.
import { addPlatformObservation } from './memoryStreamService.js';

await addPlatformObservation(
  userId,
  'Natural language observation about what happened',
  'platform_name',
  { ingestion_source: 'on_demand', raw_data: structuredData }
);
// Lower-level alternative: addMemory(userId, content, 'observation', metadata)
```

## Twin Chat Context Integration

To add a new context source to twin chat:
1. Add a parallel fetch in `api/services/twinContextBuilder.js` inside `Promise.all`
2. Add the section to the system prompt in `api/routes/twin-chat.js`
3. Track in `contextSources` object for debugging

## LLM Calls

ALL LLM calls go through the gateway:

```javascript
import { complete, TIER_ANALYSIS, TIER_EXTRACTION, TIER_CHAT } from './llmGateway.js';

const result = await complete({
  tier: TIER_ANALYSIS,  // Choose appropriate tier
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.3,
  maxTokens: 1000,
  userId,
  serviceName: 'goal_suggestion' // For cost tracking
});
// Streaming variant: stream({ ... }) from the same module.
```

## Database Migrations

- Location: `database/migrations/YYYYMMDD_description.sql` (canonical tree — its filenames match the live applied history. Do NOT use `database/supabase/migrations/`, which is frozen/legacy and diverged from prod.)
- Apply via Supabase MCP: `mcp__supabase__apply_migration` (pass `name` = the filename stem; the recorded `version` auto-generates as a 14-digit timestamp and will NOT match the file's date prefix — that is expected, not a bug)
- FK constraints MUST reference `public.users(id)` not `auth.users(id)`
- Always enable RLS and create policies for user isolation
- Always add service_role full access policy

## Platform Data Extraction

Platform data flows through Nango proxy for token management:
```
Platform API -> Nango -> extractionOrchestrator -> observationIngestion -> Memory Stream
```

Metric types for goal tracking: sleep_hours, recovery_score, hrv, meeting_count, focus_time, listening_hours

## Testing Checklist

- [ ] Generate JWT with `{id: 'user-uuid'}` (not userId)
- [ ] Test with curl against http://localhost:3004/api/
- [ ] Verify RLS policies work (user can only see own data)
- [ ] Check server logs for errors
- [ ] Use `/test-api` slash command for quick endpoint testing
