-- audit-2026-05-24 H2: cron-wiki-compile and any future feature-flag-driven
-- cron filter on (flag_name, enabled). The PK (user_id, flag_name) makes
-- user_id the leading column → flag_name lookup is a seq scan. With 1 row
-- today this is invisible, but a flag opt-in expanding to 1k+ users
-- becomes O(N) per cron tick.
CREATE INDEX IF NOT EXISTS idx_feature_flags_name_enabled
  ON public.feature_flags (flag_name, enabled);
