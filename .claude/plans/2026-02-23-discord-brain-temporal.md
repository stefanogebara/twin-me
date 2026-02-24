# Discord → Brain → Temporal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire Discord data extraction into the memory stream, display real reflections on BrainPage, and add a temporal timeline showing how the soul signature evolves over time.

**Architecture:** Three sequential tasks build on each other: Discord observations flow into the memory stream via the existing `runObservationIngestion()` pipeline; BrainPage gains a Reflections section that reads `memory_type='reflection'` rows directly instead of LLM-on-demand; the temporal timeline reads `brain_snapshots` rows (already stored by the twins-brain service) and renders them with recharts LineChart.

**Tech Stack:** Node.js/Express, Supabase/PostgreSQL, React 18, TypeScript, recharts (already installed), Framer Motion

---

## Task 1: Discord Extraction → Memory Stream

### What exists
- `api/services/observationIngestion.js` → `fetchDiscordObservations(userId)` (line ~441) already pulls guild list and category interests
- `api/routes/cron-observation-ingestion.js` → `POST /api/cron-observation-ingestion` (no auth in dev mode)
- `addPlatformObservation()` in `memoryStreamService.js` writes to `user_memories` with `memory_type='platform_data'`

### What's missing
- No way to trigger ingestion for a **specific user** from the UI (cron runs for all users)
- No admin/manual-trigger endpoint that accepts a userId
- `user_memories` likely has no Discord rows yet for the connected test user

**Files:**
- Create: `api/routes/admin-trigger-ingestion.js`
- Modify: `api/server.js` (mount new route)
- Test: manual curl + DB verification

---

**Step 1: Check current Discord memories in DB**

Run this SQL in Supabase:
```sql
SELECT memory_type, platform, content, created_at
FROM user_memories
WHERE user_id = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d'
  AND platform = 'discord'
ORDER BY created_at DESC
LIMIT 20;
```

Expected: 0 rows (Discord never extracted yet)

---

**Step 2: Trigger cron endpoint manually**

```bash
curl -s -X POST http://localhost:3004/api/cron-observation-ingestion \
  -H "Content-Type: application/json" | jq .
```

Expected: `{ "success": true, "observationsStored": N, "usersProcessed": 1 }`

If N > 0 and discord observations appear, **skip Steps 3-6** and go to Step 7.

---

**Step 3: Create user-specific ingestion trigger route**

Create `api/routes/admin-trigger-ingestion.js`:

```javascript
/**
 * Manual trigger for observation ingestion — specific user
 * POST /api/admin/trigger-ingestion
 * Body: { userId: string }
 * Dev-only (guarded by NODE_ENV check)
 */
import { runObservationIngestionForUser } from '../services/observationIngestion.js';
import { authenticateToken } from '../middleware/auth.js';

export default function(router) {
  router.post('/trigger-ingestion', authenticateToken, async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Not available in production' });
    }
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const result = await runObservationIngestionForUser(userId);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
```

---

**Step 4: Add `runObservationIngestionForUser` to observationIngestion.js**

In `api/services/observationIngestion.js`, find the existing `runObservationIngestion()` export (line ~998).

Add new export after it:

```javascript
/**
 * Run ingestion for a single user — for manual triggering in dev/testing.
 */
async function runObservationIngestionForUser(userId) {
  const stats = { usersProcessed: 0, observationsStored: 0, reflectionsTriggered: 0, errors: [] };
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Database not available');

  // Get active platform connections for this user
  const { data: connections } = await supabase
    .from('platform_connections')
    .select('platform')
    .eq('user_id', userId)
    .not('connected_at', 'is', null)
    .in('platform', SUPPORTED_PLATFORMS);

  const platforms = (connections || []).map(c => c.platform);
  if (platforms.length === 0) {
    return { ...stats, message: 'No active platform connections' };
  }

  // Process using same logic as main function
  const userMap = new Map([[userId, platforms]]);
  for (const [uid, plats] of userMap) {
    const result = await processUserObservations(uid, plats);
    stats.usersProcessed++;
    stats.observationsStored += result.stored;
    stats.reflectionsTriggered += result.reflections;
    stats.errors.push(...result.errors);
  }

  return stats;
}

export {
  runObservationIngestion,
  runObservationIngestionForUser,  // add this
};
```

**Note:** You'll need to extract the inner per-user loop body from `runObservationIngestion()` (lines ~640-760) into a `processUserObservations(userId, platforms)` helper that returns `{ stored, reflections, errors }`.

---

**Step 5: Mount the admin route in server.js**

In `api/server.js`, find where other routes are mounted. Add:

```javascript
import adminTriggerIngestion from './routes/admin-trigger-ingestion.js';
// ...
const adminRouter = express.Router();
adminTriggerIngestion(adminRouter);
app.use('/api/admin', adminRouter);
```

---

**Step 6: Test trigger endpoint**

```bash
# Get a valid JWT first (use the existing /api/auth/login or /api/auth/verify-token)
TOKEN=$(curl -s -X POST http://localhost:3004/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"stefanogebara@gmail.com","password":"YOUR_PASSWORD"}' | jq -r .token)

curl -s -X POST http://localhost:3004/api/admin/trigger-ingestion \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq .
```

Expected: `{ "success": true, "observationsStored": 2, "usersProcessed": 1 }`

---

**Step 7: Verify Discord observations in memory stream**

```sql
SELECT memory_type, platform, content, importance_score, created_at
FROM user_memories
WHERE user_id = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d'
  AND platform = 'discord'
ORDER BY created_at DESC
LIMIT 10;
```

Expected: 2+ rows with `memory_type='platform_data'`, `platform='discord'`, content like "Member of N Discord communities: ..."

---

**Step 8: Verify reflection triggered**

```sql
SELECT memory_type, content, importance_score, created_at
FROM user_memories
WHERE user_id = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d'
  AND memory_type = 'reflection'
ORDER BY created_at DESC
LIMIT 5;
```

Expected: At least 1 reflection row with `importance_score >= 7`.
(Reflections trigger when accumulated importance > 150 — may need multiple ingestion runs)

---

**Step 9: Commit**

```bash
git add api/routes/admin-trigger-ingestion.js api/services/observationIngestion.js api/server.js
git commit -m "feat: add per-user observation ingestion trigger + verify Discord extraction"
```

---

## Task 2: BrainPage — Wire Real Reflections

### What exists
- `BrainPage.tsx` (`src/pages/BrainPage.tsx`) fetches proactive insights via `GET /api/twin/insights` → `intelligentTwinEngine.generateInsightsAndRecommendations()` — generates LLM insights on-demand (slow, expensive)
- `user_memories` table has `memory_type='reflection'` rows from the reflection engine — these are the twin's actual learned insights (importance_score 7-9)
- The existing `/api/twin/insights` endpoint is fine to keep for proactive insights

### What's missing
- No endpoint to fetch actual **reflections** from the memory stream
- BrainPage shows proactive insights only — not the richer reflections

**Files:**
- Modify: `api/routes/intelligent-twin.js` (add `/reflections` endpoint)
- Modify: `src/pages/BrainPage.tsx` (add Reflections section)

---

**Step 1: Add `/api/twin/reflections` endpoint**

In `api/routes/intelligent-twin.js`, after the existing `/insights` handler, add:

```javascript
/**
 * GET /api/twin/reflections
 * Fetch the twin's stored reflections from the memory stream.
 * These are generated by the reflection engine (importance 7-9).
 */
router.get('/reflections', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const limit = parseInt(req.query.limit) || 20;

    const supabase = getSupabaseClient(); // use existing helper already imported in this file
    const { data, error } = await supabase
      .from('user_memories')
      .select('id, content, importance_score, metadata, created_at')
      .eq('user_id', userId)
      .eq('memory_type', 'reflection')
      .order('importance_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const reflections = (data || []).map(r => ({
      id: r.id,
      content: r.content,
      importance: r.importance_score,
      expert: r.metadata?.expert || null,
      category: r.metadata?.category || r.metadata?.domain || null,
      createdAt: r.created_at,
    }));

    res.json({ success: true, reflections });
  } catch (err) {
    console.error('[Twin API] Reflections error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
```

**Note:** Check how the Supabase client is obtained in this file (look at the top-level imports and any existing route handlers that query DB directly). The pattern will be consistent with other endpoints in the file.

---

**Step 2: Test the endpoint**

```bash
curl -s "http://localhost:3004/api/twin/reflections?limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq '.reflections[] | {content: .content[:80], importance: .importance, expert: .expert}'
```

Expected: Array of reflection objects. If empty, run ingestion (Task 1) first to accumulate importance until reflection engine triggers.

---

**Step 3: Add `Reflection` type and fetch to BrainPage.tsx**

In `src/pages/BrainPage.tsx`, add after the `Insight` interface (line 28):

```typescript
interface Reflection {
  id: string;
  content: string;
  importance: number;
  expert: string | null;
  category: string | null;
  createdAt: string;
}
```

Add state after existing `insights` state (around line 92):

```typescript
const [reflections, setReflections] = useState<Reflection[]>([]);
const [reflectionsLoading, setReflectionsLoading] = useState(false);
```

Add a second `useEffect` after the existing one (after line 124):

```typescript
useEffect(() => {
  if (!isSignedIn || isDemoMode || !user?.id) return;

  const fetchReflections = async () => {
    setReflectionsLoading(true);
    try {
      const res = await authFetch('/twin/reflections?limit=20');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.reflections)) {
        setReflections(json.reflections);
      }
    } catch {
      // silently fail — reflections are additive, not critical
    } finally {
      setReflectionsLoading(false);
    }
  };

  fetchReflections();
}, [isSignedIn, isDemoMode, user?.id]);
```

---

**Step 4: Add Reflections panel to BrainPage JSX**

Add import at top of BrainPage.tsx (after existing imports):

```typescript
// (RefreshCw is already imported on line 25 — no new import needed)
```

In the JSX return, change the grid from `lg:grid-cols-3` to stay 3-col but add a new full-width row. After the closing `</div>` of the `lg:col-span-2` Discoveries section (around line 276), BEFORE the closing `</div>` of the 3-col grid, add:

```tsx
{/* Reflections — full width below two-column section */}
{(reflections.length > 0 || reflectionsLoading) && (
  <div className="lg:col-span-3">
    <GlassPanel>
      <div className="flex items-center gap-2 mb-5">
        <Sparkles className="w-4 h-4" style={{ color: '#8b5cf6' }} />
        <h2 className="heading-serif text-lg" style={{ color: textColor }}>
          What Your Twin Has Learned
        </h2>
        {reflections.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full ml-1"
            style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}>
            {reflections.length} reflections
          </span>
        )}
      </div>

      {reflectionsLoading && (
        <div className="flex items-center gap-2 py-4" style={{ color: textSecondary }}>
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading reflections…</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {reflections.map((r, i) => (
          <motion.div
            key={r.id}
            className="p-4 rounded-xl"
            style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.08)' }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.04 }}
          >
            {r.expert && (
              <p className="text-xs font-semibold uppercase tracking-wide mb-1.5"
                style={{ color: '#8b5cf6' }}>
                {r.expert}
              </p>
            )}
            <p className="text-sm leading-relaxed" style={{ color: textColor }}>
              {r.content}
            </p>
            <div className="flex items-center gap-2 mt-2">
              {r.category && (
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(139,92,246,0.08)', color: '#8b5cf6' }}>
                  {r.category}
                </span>
              )}
              <span className="text-xs" style={{ color: textSecondary }}>
                importance {r.importance}/10
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </GlassPanel>
  </div>
)}
```

---

**Step 5: Visual check**

Open http://localhost:8086/brain — should see:
- Existing Discoveries section (top-left 2/3)
- Your Data section (top-right 1/3)
- New "What Your Twin Has Learned" section spanning full width below

If no reflections visible: run ingestion trigger, check DB has reflection rows.

---

**Step 6: Commit**

```bash
git add api/routes/intelligent-twin.js src/pages/BrainPage.tsx
git commit -m "feat: wire real reflections from memory stream into BrainPage"
```

---

## Task 3: Temporal Evolution — Soul Signature Timeline

### What exists
- `brain_snapshots` table: `id, user_id, snapshot_date, graph_state JSONB, node_count, edge_count, avg_confidence, top_categories, snapshot_type`
- `GET /api/twins-brain/snapshots` → returns list of snapshots with `avg_confidence`, `node_count`
- `POST /api/twins-brain/snapshots` → creates a snapshot (body: `{ snapshotType, notes }`)
- recharts is already installed (used in `AudioFeaturesRadar.tsx`, `GenreDistributionChart.tsx`)

### What's missing
- No snapshot rows yet for the test user (need to seed)
- No frontend timeline component
- No trigger to auto-create snapshots after observation ingestion

**Files:**
- Create: `src/components/brain/SoulEvolutionTimeline.tsx`
- Modify: `src/pages/BrainPage.tsx` (add timeline section)
- Modify: `api/routes/cron-observation-ingestion.js` (auto-snapshot after ingestion)

---

**Step 1: Seed initial snapshots via SQL**

Run in Supabase SQL editor:

```sql
INSERT INTO brain_snapshots (user_id, snapshot_date, graph_state, node_count, edge_count, avg_confidence, snapshot_type)
VALUES
  ('167c27b5-a40b-49fb-8d00-deb1b1c57f4d', NOW() - interval '7 days', '{}', 8,  12, 0.45, 'automatic'),
  ('167c27b5-a40b-49fb-8d00-deb1b1c57f4d', NOW() - interval '5 days', '{}', 14, 22, 0.52, 'automatic'),
  ('167c27b5-a40b-49fb-8d00-deb1b1c57f4d', NOW() - interval '3 days', '{}', 19, 31, 0.61, 'automatic'),
  ('167c27b5-a40b-49fb-8d00-deb1b1c57f4d', NOW() - interval '1 day',  '{}', 23, 38, 0.68, 'automatic');
```

---

**Step 2: Verify snapshots API returns data**

```bash
curl -s "http://localhost:3004/api/twins-brain/snapshots?limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq '.snapshots[] | {date: .snapshot_date, nodes: .node_count, confidence: .avg_confidence}'
```

Expected: 4 snapshot objects with dates and confidence scores.

---

**Step 3: Create SoulEvolutionTimeline component**

Create `src/components/brain/SoulEvolutionTimeline.tsx`:

```tsx
import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts';
import { motion } from 'framer-motion';

interface Snapshot {
  id: string;
  snapshot_date: string;
  node_count: number;
  avg_confidence: number;
  snapshot_type: string;
}

interface Props {
  snapshots: Snapshot[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-lg"
      style={{ background: 'white', border: '1px solid rgba(0,0,0,0.08)' }}>
      <p className="font-medium mb-1">{label}</p>
      <p style={{ color: '#8b5cf6' }}>
        Confidence: {((payload[0]?.value ?? 0) * 100).toFixed(0)}%
      </p>
      <p style={{ color: '#10b981' }}>
        Knowledge nodes: {payload[1]?.value}
      </p>
    </div>
  );
};

export const SoulEvolutionTimeline: React.FC<Props> = ({ snapshots }) => {
  const data = snapshots
    .slice()
    .sort((a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime())
    .map(s => ({
      date: formatDate(s.snapshot_date),
      confidence: s.avg_confidence ?? 0,
      nodes: s.node_count ?? 0,
    }));

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center py-8 text-sm"
        style={{ color: '#8A857D' }}>
        Collect more data over time to see your soul signature evolve.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="nodeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.12} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#8A857D' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="conf"
            domain={[0, 1]}
            tick={{ fontSize: 11, fill: '#8A857D' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `${(v * 100).toFixed(0)}%`}
          />
          <YAxis
            yAxisId="nodes"
            orientation="right"
            tick={{ fontSize: 11, fill: '#8A857D' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            yAxisId="conf"
            type="monotone"
            dataKey="confidence"
            stroke="#8b5cf6"
            strokeWidth={2}
            fill="url(#confGrad)"
            dot={{ r: 3, fill: '#8b5cf6' }}
          />
          <Area
            yAxisId="nodes"
            type="monotone"
            dataKey="nodes"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#nodeGrad)"
            dot={{ r: 3, fill: '#10b981' }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-2 justify-center">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 rounded" style={{ background: '#8b5cf6' }} />
          <span className="text-xs" style={{ color: '#8A857D' }}>Confidence</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 rounded" style={{ background: '#10b981' }} />
          <span className="text-xs" style={{ color: '#8A857D' }}>Knowledge nodes</span>
        </div>
      </div>
    </motion.div>
  );
};
```

---

**Step 4: Add snapshots fetch + timeline to BrainPage.tsx**

Add `BrainSnapshot` interface after the `Reflection` interface:

```typescript
interface BrainSnapshot {
  id: string;
  snapshot_date: string;
  node_count: number;
  avg_confidence: number;
  snapshot_type: string;
}
```

Add state:

```typescript
const [snapshots, setSnapshots] = useState<BrainSnapshot[]>([]);
```

Add fetch effect:

```typescript
useEffect(() => {
  if (!isSignedIn || isDemoMode || !user?.id) return;

  authFetch('/twins-brain/snapshots?limit=30')
    .then(r => r.ok ? r.json() : null)
    .then(json => {
      if (json?.success && Array.isArray(json.snapshots)) {
        setSnapshots(json.snapshots);
      }
    })
    .catch(() => {});
}, [isSignedIn, isDemoMode, user?.id]);
```

Add import at top:

```typescript
import { SoulEvolutionTimeline } from '@/components/brain/SoulEvolutionTimeline';
```

Add timeline section in JSX — after the Reflections panel, before the closing `</div>` of the main grid:

```tsx
{/* Soul Evolution Timeline */}
{snapshots.length >= 2 && (
  <div className="lg:col-span-3">
    <GlassPanel>
      <div className="flex items-center gap-2 mb-5">
        <Clock className="w-4 h-4" style={{ color: '#8A857D' }} />
        <h2 className="heading-serif text-lg" style={{ color: textColor }}>
          Soul Signature Evolution
        </h2>
        <span className="text-xs ml-auto" style={{ color: textSecondary }}>
          {snapshots.length} snapshots
        </span>
      </div>
      <p className="text-xs mb-4" style={{ color: textSecondary }}>
        How your twin's understanding of you has grown over time.
      </p>
      <SoulEvolutionTimeline snapshots={snapshots} />
    </GlassPanel>
  </div>
)}
```

---

**Step 5: Auto-create snapshot after ingestion runs**

In `api/routes/cron-observation-ingestion.js`, after `runObservationIngestion()` succeeds and `observationsStored > 0`, add before the final `return res.json(...)`:

```javascript
// Auto-snapshot users who had new observations stored
if (result.observationsStored > 0 && Array.isArray(result.processedUserIds)) {
  try {
    const { twinsBrainService } = await import('../services/twinsBrainService.js');
    for (const uid of result.processedUserIds) {
      twinsBrainService.createSnapshot(uid, 'automatic').catch(e =>
        console.warn('[CRON] Auto-snapshot failed for', uid, e.message)
      );
    }
  } catch (e) {
    console.warn('[CRON] Auto-snapshot setup failed:', e.message);
  }
}
```

Also update `runObservationIngestion()` stats object in `observationIngestion.js` to include `processedUserIds: []` and populate it when a user has observations stored.

---

**Step 6: TypeScript build check**

```bash
cd /c/Users/stefa/twin-ai-learn && npx tsc --noEmit 2>&1 | head -30
```

Expected: Zero errors. Fix any type mismatches before proceeding.

---

**Step 7: Visual check**

Open http://localhost:8086/brain — should now show (top to bottom):
1. Discoveries section (top-left 2/3) + Your Data (top-right 1/3)
2. "What Your Twin Has Learned" — purple reflection cards, full width
3. "Soul Signature Evolution" — dual-line area chart, full width

The timeline shows purple line (confidence %) and green line (node count) over dates.

---

**Step 8: Commit**

```bash
git add src/components/brain/SoulEvolutionTimeline.tsx src/pages/BrainPage.tsx api/routes/cron-observation-ingestion.js api/services/observationIngestion.js
git commit -m "feat: add soul signature evolution timeline to BrainPage"
```

---

## Files Modified Summary

| File | Task | Change |
|------|------|--------|
| `api/services/observationIngestion.js` | 1 | Add `runObservationIngestionForUser()`, extract `processUserObservations()` helper, add `processedUserIds` to stats |
| `api/routes/admin-trigger-ingestion.js` | 1 | New: per-user manual ingestion trigger |
| `api/server.js` | 1 | Mount `/api/admin` router |
| `api/routes/intelligent-twin.js` | 2 | Add `GET /api/twin/reflections` endpoint |
| `src/pages/BrainPage.tsx` | 2 & 3 | Add Reflection + Snapshot interfaces, fetch effects, Reflections panel, Timeline panel |
| `src/components/brain/SoulEvolutionTimeline.tsx` | 3 | New: recharts AreaChart dual-axis timeline |
| `api/routes/cron-observation-ingestion.js` | 3 | Auto-snapshot after successful ingestion |

---

## Verification Checklist

- [ ] Discord observations appear in `user_memories` with `memory_type='platform_data'`, `platform='discord'`
- [ ] Reflection engine triggered (at least 1 `memory_type='reflection'` row exists)
- [ ] `GET /api/twin/reflections` returns non-empty array
- [ ] BrainPage shows "What Your Twin Has Learned" section with purple reflection cards
- [ ] `brain_snapshots` has multiple rows for the test user
- [ ] `GET /api/twins-brain/snapshots` returns those rows
- [ ] BrainPage shows "Soul Signature Evolution" chart with 2 lines (purple confidence + green nodes)
- [ ] `npx tsc --noEmit` exits with 0 errors
- [ ] No regressions on existing BrainPage sections (Discoveries, Your Data)
