-- Migration: 20260514_audit_l1_l3
-- audit-2026-05-12 follow-up: close the two low-severity Supabase advisors
-- for magic_link_tokens (RLS enabled without policies) and
-- user_memories_archive (no primary key).
--
-- Applied to prod 2026-05-13 via mcp__claude_ai_Supabase__apply_migration.
-- Mirrored here so the migration is tracked in the repo for future
-- environments and replays.

-- =====================================================================
-- L1: magic_link_tokens — explicit deny policies for anon + authenticated.
-- =====================================================================
-- The table only stores SHA-256 hashed tokens with 15-minute TTL and is
-- written/read solely by the backend via service_role, which bypasses RLS.
-- Adding explicit RESTRICTIVE deny policies satisfies the Supabase advisor
-- (RLS-enabled-without-policy is treated as a security finding) and
-- prevents a future role change from accidentally exposing the table.

CREATE POLICY "deny_all_anon_magic_link_tokens"
  ON public.magic_link_tokens
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "deny_all_authenticated_magic_link_tokens"
  ON public.magic_link_tokens
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- =====================================================================
-- L3: user_memories_archive — add primary key on id.
-- =====================================================================
-- Pre-checked 2026-05-13: 1425 rows, 1425 distinct ids, zero nulls.
-- Without a PK, Postgres replication can't track row identity efficiently
-- and ORM tools (supabase-js .single(), upsert, etc.) treat the table as
-- not-safely-mutable.

ALTER TABLE public.user_memories_archive
  ADD CONSTRAINT user_memories_archive_pkey PRIMARY KEY (id);
