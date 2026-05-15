-- ============================================================================
-- 20260515_h4_proactive_insights_backfill.sql
-- ============================================================================
-- audit-2026-05-15 H4: two-part backfill applied to prod on 2026-05-15.
--
-- PART 1: Backfill 200 stale insights (delivered=false, >7d old) as expired.
--   The proactive insight delivery channel is the next chat turn. If a user
--   doesn't chat for 7+ days, insights pile up indefinitely. New high-urgency
--   insights then compete for sidebar real estate against 7d-old ones.
--   Solution: mark stale ones as delivered=true with metadata.expiry_reason
--   so they're still queryable but no longer block the queue.
--
-- PART 2: Backfill 43 morning_briefing_cache rows that had delivered=true
--   but delivered_at IS NULL — the 27+ mismatch the audit flagged. The
--   source bug is fixed in api/routes/morning-briefing.js (now sets
--   delivered_at on insert). For existing rows we use created_at as the
--   best-guess delivery time since the row IS the delivery.
--
-- Both UPDATEs are idempotent on the metadata flag — re-running won't
-- double-stamp.
-- ============================================================================

-- Part 1: stale-7d backfill
UPDATE proactive_insights p
SET
  delivered = true,
  delivered_at = NOW(),
  metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
    'expired_at', NOW(),
    'expiry_reason', 'stale_7d_backfill_2026_05_15'
  )
WHERE delivered = false
  AND created_at <= NOW() - INTERVAL '7 days'
  AND (metadata->>'expiry_reason') IS DISTINCT FROM 'stale_7d_backfill_2026_05_15';

-- Part 2: morning_briefing_cache delivered_at backfill
UPDATE proactive_insights
SET
  delivered_at = created_at,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'delivered_at_backfilled_from_created_at', true,
    'backfill_reason', 'morning_briefing_cache_missing_delivered_at_2026_05_15'
  )
WHERE category = 'morning_briefing_cache'
  AND delivered = true
  AND delivered_at IS NULL;
