-- Twin fidelity battery waves (R4 — test-retest normalized evaluation).
-- Plan: .claude/plans/2026-08-01-twin-interview/README.md (Phase 4).
--
-- One row per (user, battery_version, wave): the user's answers to the
-- fixed 20-item battery, the twin's answers to the same battery, and the
-- computed metrics. self_consistency compares this wave's user answers to
-- the PREVIOUS wave's (the Park et al. 2024 human ceiling); wave 1 has no
-- ceiling so self_consistency / normalized_fidelity are null there.
--
-- Distinct from twin_fidelity_scores (behavioral-probe method) — the two
-- methods coexist; see fidelityBatteryService.js header.
--
-- Answers reveal personality data → RLS deny-by-default; all app access
-- via supabaseAdmin (service_role).

create table if not exists public.twin_fidelity_checks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  battery_version     int not null,
  wave                int not null,
  user_answers        jsonb not null,
  twin_answers        jsonb,
  twin_accuracy       numeric,
  self_consistency    numeric,
  normalized_fidelity numeric,
  created_at          timestamptz not null default now(),
  unique (user_id, battery_version, wave)
);

create index if not exists idx_twin_fidelity_checks_user
  on public.twin_fidelity_checks (user_id, battery_version, wave desc);

alter table public.twin_fidelity_checks enable row level security;

comment on table public.twin_fidelity_checks is
  'Fidelity battery waves — user + twin answers to the fixed battery, twin accuracy normalized by user test-retest consistency.';
