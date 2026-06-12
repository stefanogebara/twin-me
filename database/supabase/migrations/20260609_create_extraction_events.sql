-- Durable extraction-path telemetry (consolidation Phase 0 follow-up, 2026-06-09)
--
-- extraction_run events are emitted by api/services/extractionTelemetry.js to
-- show which extraction path fires per platform. The BACKGROUND (cron) path is
-- already durably recorded in cron_executions.result_data, but the on_demand,
-- post_onboarding, and oauth_callback paths only existed in short-retention
-- Vercel logs. This table durably persists those non-cron paths so the Phase 4
-- "which path fires per platform" census is reliable over weeks.
--
-- Low volume (all user-triggered): on_demand (extract button), oauth_callback
-- (platform connect), post_onboarding (once per onboard). The high-volume
-- background path is intentionally NOT persisted here (already in cron_executions).

create table if not exists public.extraction_events (
  id               bigint generated always as identity primary key,
  ingestion_source text        not null,
  platform         text        not null,
  user_id          uuid,
  created_at       timestamptz not null default now()
);

comment on table public.extraction_events is
  'Durable telemetry for non-cron extraction paths (on_demand/oauth_callback/post_onboarding). Background path lives in cron_executions. Service-role write only.';

create index if not exists idx_extraction_events_source_platform
  on public.extraction_events (ingestion_source, platform);
create index if not exists idx_extraction_events_created_at
  on public.extraction_events (created_at desc);

-- Service-role-only: enable RLS with no policies so the anon/authenticated API
-- can neither read nor write this internal telemetry. The server writes via
-- supabaseAdmin (service role), which bypasses RLS.
alter table public.extraction_events enable row level security;
