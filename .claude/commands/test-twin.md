---
description: Test the twin chat and verify memory/context integration. Pass test message as argument.
allowed-tools: Bash, Read, Grep
---

Test the twin chat endpoint and verify the full context pipeline is working.

**Test message:** $ARGUMENTS

If no message provided, use: "Hey, what have you been noticing about my patterns lately?"

## Setup

```bash
JWT_SECRET=$(grep JWT_SECRET /c/Users/stefa/twin-ai-learn/.env | cut -d= -f2)
TOKEN=$(node -e "const jwt = require('jsonwebtoken'); console.log(jwt.sign({id:'167c27b5-4a30-49e1-aa79-9973d1e4e06f'}, '$JWT_SECRET', {expiresIn:'1h'}))")
```

## Send Message

Send the chat message to the twin:

```bash
curl -s -X POST http://localhost:3004/api/chat/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"message\":\"$ARGUMENTS\"}"
```

## Verify Context Sources

Check the response for:
1. **Twin response quality** - Does it reference real user data? Does it have personality?
2. **Context sources** - Which sources were included? (twinSummary, memories, platformData, activeGoals, proactiveInsights)
3. **Memory retrieval** - Were relevant memories fetched?
4. **Goal integration** - Are active goals referenced when appropriate?

Report a quality score (1-10) and specific observations about the twin's response.
