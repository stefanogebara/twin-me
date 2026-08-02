-- R4 calibration layer: per-item twin confidence + wave calibration
-- (Brier, accuracy-by-confidence-bucket) on fidelity waves.
-- Plan: .claude/plans/2026-08-01-simile-research (R4, "feeds R2 calibration").

alter table public.twin_fidelity_checks
  add column if not exists twin_confidence jsonb,
  add column if not exists calibration jsonb;

comment on column public.twin_fidelity_checks.twin_confidence is
  'Per-item 0-1 confidence the twin attached to its battery answers (prompted confidence, GUM-style).';
comment on column public.twin_fidelity_checks.calibration is
  'Wave calibration: { count, brier, buckets: {low|medium|high: {count, accuracy, meanConfidence}} }.';
