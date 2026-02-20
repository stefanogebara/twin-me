---
description: Run full verification of TwinMe app - TypeScript check, Vite build, and server health check
allowed-tools: Bash, Read, Grep
---

Run these verification steps in sequence. Stop and report on the first failure:

## Step 1: TypeScript Check

```
!`cd /c/Users/stefa/twin-ai-learn && npx tsc --noEmit 2>&1 | tail -20`
```

## Step 2: Vite Build

```
!`cd /c/Users/stefa/twin-ai-learn && npx vite build 2>&1 | tail -20`
```

## Step 3: Server Health Check

Check if backend is running on port 3004:

```
!`curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/api/health 2>/dev/null || echo "SERVER_NOT_RUNNING"`
```

## Step 4: Report

Summarize the results:
- TypeScript: PASS/FAIL (with error count)
- Build: PASS/FAIL (with bundle sizes if available)
- Server: RUNNING/NOT_RUNNING

If any step failed, provide the specific errors and suggest fixes.
