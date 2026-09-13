-- Retire twin_evolution_log: nothing reads or writes it any more.
--
-- Its only reader and writer, api/services/twinEvolutionService.js, was deleted with the
-- twin formation pipeline router in #314. Checked on the live project before writing this
-- (2026-09-13): 0 rows, 32 kB. No view, function, trigger or rule depends on it; the
-- personality_evolution_trigger and recent_twin_changes view from the old
-- supabase/migrations/002 file do not exist there. Its only constraint is its own FK to
-- digital_twins and its only policy is "Service role"; both go with the table.
--
-- No CASCADE: if anything has come to depend on the table since, the drop fails instead
-- of taking that object with it. And if rows have appeared by the time this is applied,
-- it stops, so nothing is lost without someone deciding to export it first.
--
-- Applied manually (see README.md). Committing this file does not apply it.

DO $$
BEGIN
  IF to_regclass('public.twin_evolution_log') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.twin_evolution_log) THEN
      RAISE EXCEPTION 'twin_evolution_log has rows; export them before dropping it';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS public.twin_evolution_log;
