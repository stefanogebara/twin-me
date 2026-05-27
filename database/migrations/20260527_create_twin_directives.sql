-- Self-improving twin: directives + corrections audit
-- ====================================================
-- pi-reflect pattern (askjo.ai-inspired). When the user corrects the
-- twin during chat ("no, that's wrong" / "actually..." / etc.), a nightly
-- job extracts the correction into a short directive (e.g. "Stefano
-- prefers email summaries in PT-BR"). Directives get injected into the
-- system prompt on every future chat → twin gets visibly better at being
-- the user over weeks.
--
-- Two tables:
--   twin_directives    — the learned directives (user-visible, editable)
--   twin_corrections   — audit trail per detected correction (for the
--                        correction-rate dashboard metric)
--
-- Conventions (from CLAUDE.md + 20260525 RLS sweep):
--   - References public.users(id), not auth.users(id).
--   - Server uses service_role (BYPASSRLS). RLS policies are defense-in-depth.
--   - No auth.uid() = user_id policies — those evaluate false because
--     public.users.id is a separate UUID from auth.users.id.

CREATE TABLE IF NOT EXISTS twin_directives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  category TEXT NOT NULL CHECK (category IN (
    'preference',     -- "Stefano prefers email summaries in PT-BR"
    'fact',           -- "Stefano works in São Paulo"
    'tone',           -- "Be more direct, less hedging"
    'topic-avoid',    -- "Don't bring up his ex-cofounder"
    'topic-prefer'    -- "Bring up the latest from his Spotify when relevant"
  )),
  -- Provenance: which message/conversation generated this directive
  source_message_id UUID REFERENCES twin_messages(id) ON DELETE SET NULL,
  source_conversation_id UUID REFERENCES twin_conversations(id) ON DELETE SET NULL,
  -- Reinforcement: every time we detect a similar correction, increment.
  -- Higher reinforcement = higher prompt-injection priority. Decays via
  -- a separate cron (future work — for now, no auto-decay).
  reinforcement_count INT NOT NULL DEFAULT 1 CHECK (reinforcement_count > 0),
  last_reinforced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- User-edited directives are NEVER auto-overwritten by the extraction
  -- loop (preserves user authorship). Even if a similar correction comes
  -- through, we increment reinforcement_count but never rewrite content.
  user_edited BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',         -- injected into system prompt
    'paused',         -- not injected; user toggled off
    'deleted'         -- soft-delete; row kept for audit
  )),
  -- Embedding for cosine-similarity dedup (1536d, text-embedding-3-small).
  -- Null if embedding hasn't been generated yet; the merge step backfills.
  embedding extensions.vector(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot path: getActiveDirectives(userId) — fetch top N by reinforcement
-- for prompt injection on every chat turn.
CREATE INDEX IF NOT EXISTS idx_twin_directives_active_by_reinforcement
  ON twin_directives(user_id, reinforcement_count DESC, last_reinforced_at DESC)
  WHERE status = 'active';

-- Lookup by source for "where did this come from?" UI affordance.
CREATE INDEX IF NOT EXISTS idx_twin_directives_source_message
  ON twin_directives(source_message_id)
  WHERE source_message_id IS NOT NULL;

-- For dedup: cosine-similarity vector search across a user's directives.
-- ivfflat is the default; 100 lists is a good starting point for the
-- expected volume (≤1k directives per user).
CREATE INDEX IF NOT EXISTS idx_twin_directives_embedding
  ON twin_directives
  USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE twin_directives ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'twin_directives'::regclass
      AND polname = 'Service role twin_directives'
  ) THEN
    CREATE POLICY "Service role twin_directives"
      ON twin_directives FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- =====================================================================
-- twin_corrections: audit trail for the correction-rate metric
-- =====================================================================
CREATE TABLE IF NOT EXISTS twin_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- The user's correcting message AND the twin's preceding message
  -- (the thing being corrected). Either may go NULL on cascade deletes.
  message_id UUID REFERENCES twin_messages(id) ON DELETE SET NULL,
  preceding_twin_message_id UUID REFERENCES twin_messages(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES twin_conversations(id) ON DELETE SET NULL,
  -- Brief human-readable description of what triggered detection:
  -- e.g. "regex: /^actually,?\\s/i" or "llm-classifier: confidence=0.82"
  detected_signal TEXT NOT NULL,
  -- Which directive (if any) was created or reinforced as a result.
  resulting_directive_id UUID REFERENCES twin_directives(id) ON DELETE SET NULL,
  -- Whether the directive was newly created vs. an existing one reinforced.
  outcome TEXT NOT NULL CHECK (outcome IN (
    'directive_created',
    'directive_reinforced',
    'ignored_low_confidence',
    'ignored_dedup_threshold'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- For the correction-rate dashboard chart: last 7d / 30d trend.
CREATE INDEX IF NOT EXISTS idx_twin_corrections_user_timeseries
  ON twin_corrections(user_id, created_at DESC);

-- For "find the conversation where this directive was born".
CREATE INDEX IF NOT EXISTS idx_twin_corrections_resulting_directive
  ON twin_corrections(resulting_directive_id)
  WHERE resulting_directive_id IS NOT NULL;

ALTER TABLE twin_corrections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'twin_corrections'::regclass
      AND polname = 'Service role twin_corrections'
  ) THEN
    CREATE POLICY "Service role twin_corrections"
      ON twin_corrections FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE twin_directives IS
  'Self-improving twin: learned behavioral directives extracted from user corrections in chat. Injected into the system prompt on every chat turn. pi-reflect pattern (askjo.ai-inspired).';
COMMENT ON TABLE twin_corrections IS
  'Audit trail per detected user-correction during chat. Powers the correction-rate dashboard metric and traces directive provenance.';
