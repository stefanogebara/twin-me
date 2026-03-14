-- =============================================================================
-- Migration: Fix FK references from auth.users to public.users
-- Date: 2026-03-14
-- Issue: Audit #11 — Foreign key references split between auth.users and
--        public.users across 19 columns in 13 tables.
--
-- Root cause: Early migrations used Supabase's built-in auth.users as the FK
-- target. The app switched to a custom public.users table (001_initial_schema),
-- but new migrations continued to reference auth.users. Because the app
-- identifies users by public.users.id (a completely separate UUID from
-- auth.users.id), these FK constraints silently prevent inserts when the two
-- IDs differ — which they always do for non-Supabase-auth flows.
--
-- Fix: For every table that has REFERENCES auth.users(id), drop that constraint
-- and re-add it pointing at public.users(id) ON DELETE CASCADE.
--
-- Scope:
--   database/migrations/
--     024_add_api_keys_table.sql          → api_keys
--     20260205_connection_mappings.sql    → nango_connection_mappings
--
--   supabase/migrations/
--     001_initial_schema.sql              → profiles
--     004_soul_data_collection_*.sql      → user_platform_data, user_text_content,
--                                           user_embeddings, user_style_profile,
--                                           user_ngrams, conversation_memory,
--                                           platform_insights, llm_training_data,
--                                           data_extraction_jobs
--     007_soul_observer_mode_*.sql        → soul_observer_events,
--                                           soul_observer_sessions,
--                                           behavioral_patterns,
--                                           user_behavioral_embeddings,
--                                           llm_behavioral_context,
--                                           soul_observer_insights
--     010_create_platform_connections.sql → platform_connections
--
-- RLS note: Every affected table uses auth.uid() in its RLS policies to gate
-- access by user_id. Those policies are intentionally left unchanged because
-- auth.uid() returns the authenticated JWT subject — which is distinct from the
-- FK target — and the app already casts both sides to text for comparison (e.g.
-- "auth.uid()::text = user_id::text"). If/when RLS is tightened to match the
-- public.users session-variable approach, that is a separate migration.
--
-- Safety: Every block checks IF EXISTS before acting. The whole script is
-- wrapped in a transaction so a mid-run error leaves the schema unchanged.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. api_keys
--    Source:  database/migrations/024_add_api_keys_table.sql
--    Column:  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'api_keys'
      AND constraint_name = 'api_keys_user_id_fkey'
  ) THEN
    ALTER TABLE public.api_keys
      DROP CONSTRAINT api_keys_user_id_fkey;
    RAISE NOTICE 'Dropped api_keys_user_id_fkey';
  ELSE
    RAISE NOTICE 'api_keys_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'api_keys'
      AND constraint_name = 'api_keys_user_id_fkey'
  ) THEN
    ALTER TABLE public.api_keys
      ADD CONSTRAINT api_keys_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added api_keys_user_id_fkey → public.users';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. nango_connection_mappings
--    Source:  database/migrations/20260205_connection_mappings.sql
--    Column:  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'nango_connection_mappings'
      AND constraint_name = 'nango_connection_mappings_user_id_fkey'
  ) THEN
    ALTER TABLE public.nango_connection_mappings
      DROP CONSTRAINT nango_connection_mappings_user_id_fkey;
    RAISE NOTICE 'Dropped nango_connection_mappings_user_id_fkey';
  ELSE
    RAISE NOTICE 'nango_connection_mappings_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'nango_connection_mappings'
      AND constraint_name = 'nango_connection_mappings_user_id_fkey'
  ) THEN
    ALTER TABLE public.nango_connection_mappings
      ADD CONSTRAINT nango_connection_mappings_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added nango_connection_mappings_user_id_fkey → public.users';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. profiles
--    Source:  supabase/migrations/001_initial_schema.sql
--    Column:  id UUID REFERENCES auth.users(id) PRIMARY KEY
--    Note:    The PK column itself carries the FK. PostgreSQL names the
--             constraint "profiles_id_fkey" for inline REFERENCES syntax.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'profiles'
      AND constraint_name = 'profiles_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      DROP CONSTRAINT profiles_id_fkey;
    RAISE NOTICE 'Dropped profiles_id_fkey';
  ELSE
    RAISE NOTICE 'profiles_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'profiles'
      AND constraint_name = 'profiles_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
        FOREIGN KEY (id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added profiles_id_fkey → public.users';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4–10. Tables from supabase/migrations/004_soul_data_collection_architecture.sql
-- ---------------------------------------------------------------------------

-- 4. user_platform_data
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'user_platform_data'
      AND constraint_name = 'user_platform_data_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_platform_data
      DROP CONSTRAINT user_platform_data_user_id_fkey;
    RAISE NOTICE 'Dropped user_platform_data_user_id_fkey';
  ELSE
    RAISE NOTICE 'user_platform_data_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'user_platform_data'
      AND constraint_name = 'user_platform_data_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_platform_data
      ADD CONSTRAINT user_platform_data_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added user_platform_data_user_id_fkey → public.users';
  END IF;
END $$;

-- 5. user_text_content
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'user_text_content'
      AND constraint_name = 'user_text_content_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_text_content
      DROP CONSTRAINT user_text_content_user_id_fkey;
    RAISE NOTICE 'Dropped user_text_content_user_id_fkey';
  ELSE
    RAISE NOTICE 'user_text_content_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'user_text_content'
      AND constraint_name = 'user_text_content_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_text_content
      ADD CONSTRAINT user_text_content_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added user_text_content_user_id_fkey → public.users';
  END IF;
END $$;

-- 6. user_embeddings
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'user_embeddings'
      AND constraint_name = 'user_embeddings_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_embeddings
      DROP CONSTRAINT user_embeddings_user_id_fkey;
    RAISE NOTICE 'Dropped user_embeddings_user_id_fkey';
  ELSE
    RAISE NOTICE 'user_embeddings_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'user_embeddings'
      AND constraint_name = 'user_embeddings_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_embeddings
      ADD CONSTRAINT user_embeddings_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added user_embeddings_user_id_fkey → public.users';
  END IF;
END $$;

-- 7. user_style_profile
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'user_style_profile'
      AND constraint_name = 'user_style_profile_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_style_profile
      DROP CONSTRAINT user_style_profile_user_id_fkey;
    RAISE NOTICE 'Dropped user_style_profile_user_id_fkey';
  ELSE
    RAISE NOTICE 'user_style_profile_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'user_style_profile'
      AND constraint_name = 'user_style_profile_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_style_profile
      ADD CONSTRAINT user_style_profile_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added user_style_profile_user_id_fkey → public.users';
  END IF;
END $$;

-- 8. user_ngrams
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'user_ngrams'
      AND constraint_name = 'user_ngrams_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_ngrams
      DROP CONSTRAINT user_ngrams_user_id_fkey;
    RAISE NOTICE 'Dropped user_ngrams_user_id_fkey';
  ELSE
    RAISE NOTICE 'user_ngrams_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'user_ngrams'
      AND constraint_name = 'user_ngrams_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_ngrams
      ADD CONSTRAINT user_ngrams_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added user_ngrams_user_id_fkey → public.users';
  END IF;
END $$;

-- 9. conversation_memory
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'conversation_memory'
      AND constraint_name = 'conversation_memory_user_id_fkey'
  ) THEN
    ALTER TABLE public.conversation_memory
      DROP CONSTRAINT conversation_memory_user_id_fkey;
    RAISE NOTICE 'Dropped conversation_memory_user_id_fkey';
  ELSE
    RAISE NOTICE 'conversation_memory_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'conversation_memory'
      AND constraint_name = 'conversation_memory_user_id_fkey'
  ) THEN
    ALTER TABLE public.conversation_memory
      ADD CONSTRAINT conversation_memory_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added conversation_memory_user_id_fkey → public.users';
  END IF;
END $$;

-- 10. platform_insights
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'platform_insights'
      AND constraint_name = 'platform_insights_user_id_fkey'
  ) THEN
    ALTER TABLE public.platform_insights
      DROP CONSTRAINT platform_insights_user_id_fkey;
    RAISE NOTICE 'Dropped platform_insights_user_id_fkey';
  ELSE
    RAISE NOTICE 'platform_insights_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'platform_insights'
      AND constraint_name = 'platform_insights_user_id_fkey'
  ) THEN
    ALTER TABLE public.platform_insights
      ADD CONSTRAINT platform_insights_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added platform_insights_user_id_fkey → public.users';
  END IF;
END $$;

-- 11. llm_training_data
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'llm_training_data'
      AND constraint_name = 'llm_training_data_user_id_fkey'
  ) THEN
    ALTER TABLE public.llm_training_data
      DROP CONSTRAINT llm_training_data_user_id_fkey;
    RAISE NOTICE 'Dropped llm_training_data_user_id_fkey';
  ELSE
    RAISE NOTICE 'llm_training_data_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'llm_training_data'
      AND constraint_name = 'llm_training_data_user_id_fkey'
  ) THEN
    ALTER TABLE public.llm_training_data
      ADD CONSTRAINT llm_training_data_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added llm_training_data_user_id_fkey → public.users';
  END IF;
END $$;

-- 12. data_extraction_jobs
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'data_extraction_jobs'
      AND constraint_name = 'data_extraction_jobs_user_id_fkey'
  ) THEN
    ALTER TABLE public.data_extraction_jobs
      DROP CONSTRAINT data_extraction_jobs_user_id_fkey;
    RAISE NOTICE 'Dropped data_extraction_jobs_user_id_fkey';
  ELSE
    RAISE NOTICE 'data_extraction_jobs_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'data_extraction_jobs'
      AND constraint_name = 'data_extraction_jobs_user_id_fkey'
  ) THEN
    ALTER TABLE public.data_extraction_jobs
      ADD CONSTRAINT data_extraction_jobs_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added data_extraction_jobs_user_id_fkey → public.users';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 13–18. Tables from supabase/migrations/007_soul_observer_mode_architecture.sql
-- ---------------------------------------------------------------------------

-- 13. soul_observer_events
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'soul_observer_events'
      AND constraint_name = 'soul_observer_events_user_id_fkey'
  ) THEN
    ALTER TABLE public.soul_observer_events
      DROP CONSTRAINT soul_observer_events_user_id_fkey;
    RAISE NOTICE 'Dropped soul_observer_events_user_id_fkey';
  ELSE
    RAISE NOTICE 'soul_observer_events_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'soul_observer_events'
      AND constraint_name = 'soul_observer_events_user_id_fkey'
  ) THEN
    ALTER TABLE public.soul_observer_events
      ADD CONSTRAINT soul_observer_events_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added soul_observer_events_user_id_fkey → public.users';
  END IF;
END $$;

-- 14. soul_observer_sessions
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'soul_observer_sessions'
      AND constraint_name = 'soul_observer_sessions_user_id_fkey'
  ) THEN
    ALTER TABLE public.soul_observer_sessions
      DROP CONSTRAINT soul_observer_sessions_user_id_fkey;
    RAISE NOTICE 'Dropped soul_observer_sessions_user_id_fkey';
  ELSE
    RAISE NOTICE 'soul_observer_sessions_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'soul_observer_sessions'
      AND constraint_name = 'soul_observer_sessions_user_id_fkey'
  ) THEN
    ALTER TABLE public.soul_observer_sessions
      ADD CONSTRAINT soul_observer_sessions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added soul_observer_sessions_user_id_fkey → public.users';
  END IF;
END $$;

-- 15. behavioral_patterns
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'behavioral_patterns'
      AND constraint_name = 'behavioral_patterns_user_id_fkey'
  ) THEN
    ALTER TABLE public.behavioral_patterns
      DROP CONSTRAINT behavioral_patterns_user_id_fkey;
    RAISE NOTICE 'Dropped behavioral_patterns_user_id_fkey';
  ELSE
    RAISE NOTICE 'behavioral_patterns_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'behavioral_patterns'
      AND constraint_name = 'behavioral_patterns_user_id_fkey'
  ) THEN
    ALTER TABLE public.behavioral_patterns
      ADD CONSTRAINT behavioral_patterns_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added behavioral_patterns_user_id_fkey → public.users';
  END IF;
END $$;

-- 16. user_behavioral_embeddings
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'user_behavioral_embeddings'
      AND constraint_name = 'user_behavioral_embeddings_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_behavioral_embeddings
      DROP CONSTRAINT user_behavioral_embeddings_user_id_fkey;
    RAISE NOTICE 'Dropped user_behavioral_embeddings_user_id_fkey';
  ELSE
    RAISE NOTICE 'user_behavioral_embeddings_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'user_behavioral_embeddings'
      AND constraint_name = 'user_behavioral_embeddings_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_behavioral_embeddings
      ADD CONSTRAINT user_behavioral_embeddings_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added user_behavioral_embeddings_user_id_fkey → public.users';
  END IF;
END $$;

-- 17. llm_behavioral_context
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'llm_behavioral_context'
      AND constraint_name = 'llm_behavioral_context_user_id_fkey'
  ) THEN
    ALTER TABLE public.llm_behavioral_context
      DROP CONSTRAINT llm_behavioral_context_user_id_fkey;
    RAISE NOTICE 'Dropped llm_behavioral_context_user_id_fkey';
  ELSE
    RAISE NOTICE 'llm_behavioral_context_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'llm_behavioral_context'
      AND constraint_name = 'llm_behavioral_context_user_id_fkey'
  ) THEN
    ALTER TABLE public.llm_behavioral_context
      ADD CONSTRAINT llm_behavioral_context_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added llm_behavioral_context_user_id_fkey → public.users';
  END IF;
END $$;

-- 18. soul_observer_insights
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'soul_observer_insights'
      AND constraint_name = 'soul_observer_insights_user_id_fkey'
  ) THEN
    ALTER TABLE public.soul_observer_insights
      DROP CONSTRAINT soul_observer_insights_user_id_fkey;
    RAISE NOTICE 'Dropped soul_observer_insights_user_id_fkey';
  ELSE
    RAISE NOTICE 'soul_observer_insights_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'soul_observer_insights'
      AND constraint_name = 'soul_observer_insights_user_id_fkey'
  ) THEN
    ALTER TABLE public.soul_observer_insights
      ADD CONSTRAINT soul_observer_insights_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added soul_observer_insights_user_id_fkey → public.users';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 19. platform_connections
--    Source:  supabase/migrations/010_create_platform_connections.sql
--    Column:  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'platform_connections'
      AND constraint_name = 'platform_connections_user_id_fkey'
  ) THEN
    ALTER TABLE public.platform_connections
      DROP CONSTRAINT platform_connections_user_id_fkey;
    RAISE NOTICE 'Dropped platform_connections_user_id_fkey';
  ELSE
    RAISE NOTICE 'platform_connections_user_id_fkey not found — skipping drop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'platform_connections'
      AND constraint_name = 'platform_connections_user_id_fkey'
  ) THEN
    ALTER TABLE public.platform_connections
      ADD CONSTRAINT platform_connections_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added platform_connections_user_id_fkey → public.users';
  END IF;
END $$;

-- =============================================================================
-- Verification query (informational — does not affect transaction outcome)
-- Run this after the migration to confirm all constraints now point at
-- public.users. Expected result: zero rows returned.
--
--   SELECT tc.table_name, tc.constraint_name, ccu.table_schema AS ref_schema
--   FROM information_schema.table_constraints tc
--   JOIN information_schema.referential_constraints rc
--     ON tc.constraint_name = rc.constraint_name
--    AND tc.constraint_schema = rc.constraint_schema
--   JOIN information_schema.constraint_column_usage ccu
--     ON rc.unique_constraint_name = ccu.constraint_name
--    AND rc.unique_constraint_schema = ccu.constraint_schema
--   WHERE tc.table_schema = 'public'
--     AND ccu.table_schema = 'auth'
--     AND ccu.table_name   = 'users';
-- =============================================================================

COMMIT;
