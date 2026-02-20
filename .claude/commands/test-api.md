---
description: Test TwinMe API endpoints with authenticated requests. Pass endpoint path as argument (e.g., /test-api /goals)
allowed-tools: Bash, Read
---

Test the TwinMe API endpoint specified by the user. The backend runs at http://localhost:3004/api.

**Endpoint to test:** $ARGUMENTS

## Authentication Setup

Generate a JWT for testing. Read the JWT_SECRET from the .env file and use the known test user ID (167c27b5-4a30-49e1-aa79-9973d1e4e06f from public.users).

IMPORTANT: The JWT payload MUST use `id` (not `userId`) as the field name. The auth middleware reads `payload.id || payload.userId`.

```bash
JWT_SECRET=$(grep JWT_SECRET /c/Users/stefa/twin-ai-learn/.env | cut -d= -f2)
TOKEN=$(node -e "const jwt = require('jsonwebtoken'); console.log(jwt.sign({id:'167c27b5-4a30-49e1-aa79-9973d1e4e06f'}, '$JWT_SECRET', {expiresIn:'1h'}))")
```

## Test Execution

Run curl against the endpoint with the JWT token. For GET endpoints, simply fetch. For POST endpoints, include an appropriate JSON body.

Common endpoints:
- GET /goals - List goals (filter: ?status=active|suggested|completed)
- GET /goals/suggestions - Get goal suggestions
- GET /goals/summary - Goals dashboard summary
- GET /goals/:id - Single goal with progress
- POST /goals/:id/accept - Accept a suggested goal
- POST /goals/:id/dismiss - Dismiss a suggestion
- POST /goals/:id/abandon - Abandon active goal
- POST /chat/message - Send twin chat message (body: {"message":"..."})
- GET /memories/stats - Memory stream statistics
- POST /observations/ingest - Trigger observation ingestion

Report the HTTP status code, formatted response body, and any errors.
