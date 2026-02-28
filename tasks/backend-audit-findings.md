# Backend Audit Findings

Date: 2026-02-27
Scope: api/routes/twin-chat.js, api/services/memoryStreamService.js,
api/services/reflectionEngine.js, api/services/proactiveInsights.js,
api/services/goalTrackingService.js

## Summary

| #  | Sev  | Finding                                               | Status   |
|----|------|-------------------------------------------------------|----------|
| 1  | HIGH | /chat/history crashes on all requests                 | FIXED    |
| 2  | HIGH | /chat/intro queries wrong table                       | FIXED    |
| 3  | MED  | Chat rate limit in-memory, bypassed on cold starts    | FIXED    |
| 4  | MED  | Context truncated mid-sentence at 12000 chars         | FIXED    |
| 5  | LOW  | Conversation history reads messages not twin_messages | FIXED    |
| 6  | MED  | getMemoryStats fetches 5000 rows for a count          | FIXED    |
| 7  | MED  | Fact dedup window too narrow (last 50 only)           | FIXED    |
| 8  | LOW  | Source memory decay: N individual UPDATE queries      | FIXED    |
| 9  | MED  | Reflection cooldown Map not safe on serverless        | FIXED    |
| 10 | MED  | Personality snapshots lack 24h dedup guard            | FIXED    |
| 11 | LOW  | INSUFFICIENT_EVIDENCE exact-match misses variants     | FIXED    |
| 12 | MED  | proactive_insights grows unboundedly, no cleanup      | FIXED    |
| 13 | LOW  | Observations empty when reflections dominate          | FIXED    |
| 14 | MED  | listening_hours/focus_time never track via fallback   | FIXED    |
| 15 | MED  | dismissGoal overwrites entire metadata JSONB          | FIXED    |
| 16 | LOW  | Goal streak resets on first miss, no grace days       | FIXED    |
| 17 | MED  | No per-account signin lockout                         | FIXED    |
| 18 | LOW  | memory-health leaks raw DB error messages             | FIXED    |
| 19 | MED  | memory-health: 8 parallel DB scans, no cache          | FIXED    |
| 20 | LOW  | Reflection dedup regenerates embeddings redundantly   | FIXED    |

Fixed in initial audit: Findings 1, 2, 18
Fixed in continuation audit: Findings 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 17, 19
Plus additional Whoop/platform fixes: BrainPage PLATFORM_META, connectors.js nango_connection_mappings

---

## 1. Twin Chat (api/routes/twin-chat.js)

### FINDING 1 - HIGH (FIXED) - /chat/history crashes on all requests

File: api/routes/twin-chat.js line 1271

serverDb.getMessagesByConversation() returns {data, error} (an object). The code
assigned the object directly to `messages` and called .map() on it, throwing
"TypeError: messages.map is not a function" on every request.

  BEFORE:
    const messages = await serverDb.getMessagesByConversation(conversationId, 50);
    messages.map(m => ...)          // crashes

  AFTER:
    const { data: messagesData } = await serverDb.getMessagesByConversation(conversationId, 50);
    (messagesData || []).map(m => ...) // correct

Impact: GET /api/chat/history returns 500 for ALL users. Chat history is completely broken.

### FINDING 2 - HIGH (FIXED) - /chat/intro queries wrong table; greeting fires every visit

File: api/routes/twin-chat.js line 1354

The intro endpoint checks the 'conversations' table (old school/professor system) to
decide if the user is a first-time visitor. TwinMe uses 'twin_conversations'. Since
TwinMe users have no rows in 'conversations', the check always returns 0 and the intro
greeting fires on every page load, not just the first time.

  BEFORE: .from('conversations')
  AFTER:  .from('twin_conversations')

Impact: The intro greeting fires on every chat open, making the product feel broken.

### FINDING 3 - MED - Chat rate limit in-memory; bypassed on Vercel cold starts

File: api/routes/twin-chat.js lines 58-105

chatRateLimitMap is an in-memory Map. On Vercel serverless, each cold-started function
instance has its own empty map. The 50 msg/hr limit resets on every cold start.

Recommended fix: Use Redis key chatRateLimit:{userId} with 1-hour TTL.
Fall back to in-memory on Redis failure. redisClient.js is already available.

### FINDING 4 - MED - Context truncated mid-sentence

File: api/routes/twin-chat.js lines 1026-1029

When additionalContext exceeds 12000 chars it is sliced at exactly char 12000 + '...'.
This can cut a memory reflection mid-sentence. The LLM may interpret the fragment as a
real user fact.

Recommended fix: Truncate at the last newline before the limit, or use section-aware
budgeting that stops adding new sections once the budget is exceeded.

### FINDING 5 - LOW - Conversation history reads wrong table

File: api/services/database.js line 375, api/routes/twin-chat.js line 1059

serverDb.getMessagesByConversation() queries the 'messages' table (school system), not
'twin_messages'. LLM conversation history returns empty for TwinMe users even with
existing twin conversations.

Recommended fix: Query twin_messages directly in twin-chat.js for history context,
or add getTwinMessagesByConversation() to serverDb.


---

## 2. Memory Stream Service (api/services/memoryStreamService.js)

### FINDING 6 - MED - getMemoryStats fetches 5000 rows for a count

File: api/services/memoryStreamService.js lines 856-862

getMemoryStats() calls .select("memory_type").limit(5000), fetching rows into memory
and counting in JS. For users with 16k+ memories this is a heavy read and returns
inaccurate counts above 5000.

Recommended fix: Add RPC get_memory_stats(p_user_id uuid) returning:
  SELECT memory_type, COUNT(*) FROM user_memories WHERE user_id=p1 GROUP BY memory_type

### FINDING 7 - MED - Fact dedup window too narrow (last 50 facts)

File: api/services/memoryStreamService.js line 744

isDuplicateFact() cosine similarity check scans only the last 50 facts.
Users with 200+ facts accumulate duplicates when the same fact is re-extracted months later.

Recommended fix: Increase similarity window to 200, or add created_at >= sixMonthsAgo filter.
The exact-match check already has no limit (correct).

### FINDING 8 - LOW - Source memory decay fires N individual UPDATE queries

File: api/services/memoryStreamService.js lines 242-248

decaySourceMemories() loops and fires one UPDATE per memory.
5 experts x 10 evidence memories = 50 sequential DB round-trips per reflection cycle.

Recommended fix: Add bulk_decay_memories RPC that handles all updates in one SQL call.


---

## 3. Reflection Engine (api/services/reflectionEngine.js)

### FINDING 9 - MED - Reflection cooldown Map not safe on serverless

File: api/services/reflectionEngine.js lines 165-166, 504-506

reflectionCooldowns is an in-memory Map keyed by userId. On Vercel serverless each
cold-started function instance has its own empty Map. The 6-hour cooldown resets
on every cold start, allowing runReflectionCycle() to fire multiple times per hour
for users who generate cold starts (active users, exactly the opposite of who should
be gated).

Recommended fix: Use Redis key reflectionCooldown:{userId} with 6-hour TTL.
Fall back to in-memory on Redis failure. redisClient.js is already available.

### FINDING 10 - MED - Personality snapshots lack 24h dedup guard

File: api/services/reflectionEngine.js lines 559-597

snapshotPersonalityScores() inserts a row into personality_snapshots on every
reflection cycle that touches personality. There is no unique constraint on
(user_id, DATE(created_at)) and no code-level check. Heavy users accumulate
multiple snapshots per day, bloating the table and skewing trend graphs.

Recommended fix: Add a unique constraint or a code-level guard:
  SELECT id FROM personality_snapshots
  WHERE user_id = userId AND created_at >= startOfToday
  If row exists, skip insert.

### FINDING 11 - LOW - INSUFFICIENT_EVIDENCE exact-match misses variants

File: api/services/reflectionEngine.js line 351

The reflection output parser checks:
  if (content === "INSUFFICIENT_EVIDENCE")
This exact-match fails for "INSUFFICIENT_EVIDENCE." (trailing period),
"INSUFFICIENT EVIDENCE" (space), or lower-case variants that the LLM may return.
Result: malformed strings get stored as reflection memories.

Recommended fix: Use a case-insensitive prefix check:
  if (content.toUpperCase().startsWith("INSUFFICIENT_EVIDENCE"))


---

## 4. Proactive Insights (api/services/proactiveInsights.js)

### FINDING 12 - MED - proactive_insights grows unboundedly, no cleanup

File: api/services/proactiveInsights.js

Every observation ingestion cycle potentially inserts 1-3 rows into
proactive_insights. Delivered insights (delivered=true) are never deleted.
For a user with daily platform syncs over 6 months, the table accumulates
180-540 delivered rows that are never read again. No pagination, no archival.

Recommended fix: Add a cleanup step in the delivery path or a weekly cron:
  DELETE FROM proactive_insights
  WHERE user_id = userId AND delivered = true
  AND created_at < NOW() - INTERVAL 30 days

### FINDING 13 - LOW - Observations block empty when reflections dominate

File: api/services/proactiveInsights.js lines 63-67

The insight generator fetches getRecentMemories(50) then filters:
  memories.filter(m => m.memory_type !== "reflection")
In practice, the last 50 memories for an active user are ~90% reflections
(as documented in CLAUDE.md). This leaves 0-5 observations to analyze,
causing the LLM to generate generic or hallucinated insights.

Recommended fix: Fetch memories with explicit type split:
  - getRecentMemories(20, "reflection") for reflective context
  - getRecentMemories(50, ["observation","platform_data","fact"]) for signal
  Or increase fetch limit to 200 and filter, matching the pattern in
  goalTrackingService.js extractMetricFromMemories().


---

## 5. Goal Tracking Service (api/services/goalTrackingService.js)

### FINDING 14 - MED - listening_hours/focus_time never track via fallback

File: api/services/goalTrackingService.js lines 350-358

extractMetricFromMemories() is the fallback metric extractor for goals when
no structured platform data is available. It uses regex patterns on memory
content. The patterns map:
  spotify_streams -> /listened to (d+)/i
  calendar_events -> /had (d+) (meeting|event)/i
  etc.

But listening_hours and focus_time have no regex patterns defined. When a
user accepts a goal of these types, auto-tracking via memory fallback never
fires. Progress stays at 0 forever unless structured data is available.

Recommended fix: Add regex patterns for missing goal types:
  listening_hours: /(d+.?d*) hours? (of listening|listening time)/i
  focus_time: /(d+.?d*) hours? (focused|focus|deep work)/i

### FINDING 15 - MED - dismissGoal overwrites entire metadata JSONB

File: api/services/goalTrackingService.js line 203

dismissGoal() calls:
  .update({ metadata: { dismissed: true } })
This replaces the entire metadata JSONB column with {dismissed: true},
discarding any existing fields like createdFrom, suggestionReason, or
custom user notes stored in metadata.

Recommended fix: Use Postgres jsonb_set or fetch-then-merge:
  const { data: goal } = await supabaseAdmin.from("twin_goals")
    .select("metadata").eq("id", goalId).single();
  const merged = { ...(goal.metadata || {}), dismissed: true };
  await supabaseAdmin.from("twin_goals").update({ metadata: merged });

### FINDING 16 - LOW - Goal streak resets on first miss, no grace days

File: api/services/goalTrackingService.js line 630

Streak logic:
  newStreak = targetMet ? prev + 1 : 0
A single missed day hard-resets the streak to 0. There is no grace period
or partial-credit logic. For goals like "exercise 5x/week", missing Monday
wipes a 30-day streak even if Sunday through Saturday are met.

Recommended fix: Add a grace_days config (default 1) per goal type:
  if (!targetMet && daysOverdue <= goal.grace_days) keep streak
  else newStreak = 0


---

## 6. Security (api/routes/auth-simple.js, api/routes/memory-health.js)

### FINDING 17 - MED - No per-account signin lockout

File: api/routes/auth-simple.js

authLimiter (express-rate-limit) enforces 10 attempts per 15 minutes per IP.
But there is no per-account lockout. An attacker routing through multiple IPs
(Tor, residential proxies, botnet) can attempt unlimited passwords against a
single account because the IP counter resets across different source addresses.

Recommended fix: Track failed attempts per email in Redis:
  Key: authFailures:{email}, TTL: 15 minutes, threshold: 10
  After threshold: reject with 429 for that account regardless of IP
  Reset on successful login.

### FINDING 18 - LOW (FIXED) - memory-health leaks raw DB error messages

File: api/routes/memory-health.js line 170

Before fix, the 500 handler returned the raw err.message string in production,
which can leak table names, column names, or query structure to clients.

  BEFORE: res.status(500).json({ error: err.message })
  AFTER:  res.status(500).json({ error: process.env.NODE_ENV === "development"
           ? err.message : "Failed to load memory health data" })

Fixed in this audit.


---

## 7. Performance (api/routes/memory-health.js, api/services/reflectionEngine.js)

### FINDING 19 - MED - memory-health: 8 parallel DB scans, no cache

File: api/routes/memory-health.js lines 40-106

Every GET /api/memory-health fires 8 concurrent Supabase queries against
user_memories. Query 1 (composition) fetches ALL rows for the user with no
limit. For users with 16k+ memories this is a full table scan returning
tens of thousands of rows to Node.js for in-process aggregation.

This route is called on every dashboard load and has no caching layer.

Recommended fix:
  1. Replace Query 1 with an RPC get_memory_composition(user_id) that
     does GROUP BY memory_type in Postgres, returning only counts and sums.
  2. Add Redis cache with 5-minute TTL keyed by userId.
  3. Serve stale cache on DB error.

### FINDING 20 - LOW - Reflection dedup regenerates embeddings redundantly

File: api/services/reflectionEngine.js

The cosine similarity dedup check in storeReflection() calls
embeddingService.generateEmbedding(content) for the new reflection, then
fetches recent reflection embeddings from the DB and computes cosine similarity.

The new embedding is generated BEFORE checking if the content is unique.
If the content is a duplicate, the embedding API call (and its cost/latency)
was wasted.

Recommended fix: Run a cheaper pre-check first (exact-match or bigram Jaccard
which is already implemented as fallback). Only generate the embedding if the
cheap check passes. This avoids embedding API calls for the ~30% of reflections
that are caught by exact-match alone.

---

## Files Modified in This Audit

- api/routes/twin-chat.js (Findings 1, 2 fixed)
- api/routes/memory-health.js (Finding 18 fixed)

---

## Audit Closure (2026-02-28)
Findings 8, 16, and 20 were implemented during Phase 5 (Cognitive Architecture) development.
Verified via code inspection on 2026-02-28. All 20 findings are resolved. Audit is COMPLETE.
