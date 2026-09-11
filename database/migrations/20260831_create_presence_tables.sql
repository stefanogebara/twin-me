-- Presence: family-relay AI companion — core data model
-- ======================================================
-- Plans: .claude/plans/2026-08-31-presence-onboarding-system/ and
--        .claude/plans/2026-08-31-presence-context-architecture/
--
-- Six tables:
--   presences          — one row per cared-for relationship (owner = family member)
--   presence_consents  — append-only consent records (never updated in place)
--   presence_people    — the family map: who is who, what she calls them (store 3)
--   presence_facts     — codebook + anchors + boundaries + learned biography (stores 2/4),
--                        with the write-gate confidence field (commit/provisional/ask)
--   presence_voice     — voice build state (metadata; sample file storage is a later slice)
--   presence_notes     — the family channel: notes carried into her next conversation (store 6)
--
-- Conventions (from CLAUDE.md + 20260525 RLS sweep + 20260527 directives migration):
--   - References public.users(id), NOT auth.users(id) — separate UUIDs.
--   - Server uses service_role (BYPASSRLS). RLS enabled as defense-in-depth;
--     no auth.uid() = user_id policies (they evaluate false by design here).

CREATE TABLE IF NOT EXISTS presences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  cared_for_name TEXT NOT NULL DEFAULT '' CHECK (length(cared_for_name) <= 120),
  relationship TEXT NOT NULL DEFAULT 'grandmother' CHECK (length(relationship) <= 40),
  caller_name TEXT NOT NULL DEFAULT '' CHECK (length(caller_name) <= 120),
  tone TEXT NOT NULL DEFAULT '' CHECK (length(tone) <= 80),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presences_owner
  ON presences(owner_user_id, updated_at DESC)
  WHERE status <> 'deleted';

-- Append-only: a consent row is evidence; revocation is a NEW row of kind
-- 'own_voice_revoked', never an UPDATE or DELETE of the original.
CREATE TABLE IF NOT EXISTS presence_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_id UUID NOT NULL REFERENCES presences(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('own_voice', 'own_voice_revoked', 'ai_disclosure')),
  text_version TEXT NOT NULL CHECK (length(text_version) <= 2000),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presence_consents_presence
  ON presence_consents(presence_id, accepted_at DESC);

-- Family map. Confusing people is the worst conversational failure, so this is
-- structured and family-authoritative, and pinned into every call brief.
CREATE TABLE IF NOT EXISTS presence_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_id UUID NOT NULL REFERENCES presences(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  relation TEXT NOT NULL DEFAULT '' CHECK (length(relation) <= 80),   -- to the cared-for person
  called_by TEXT NOT NULL DEFAULT '' CHECK (length(called_by) <= 120), -- what SHE calls them
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presence_people_presence
  ON presence_people(presence_id)
  WHERE status = 'active';

-- Everything the Presence knows that isn't a person or a note.
--   kind: tone/language/boundary come from onboarding; anchor = story seeds
--         ("her world"); biography = learned in conversation; care_signal =
--         health/worry observations routed to the family digest only.
--   confidence: the write gate (plan §3, MCB arXiv 2608.19564) —
--         committed | provisional (expires_at set, re-verified) | ask
--         (becomes a family question card).
CREATE TABLE IF NOT EXISTS presence_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_id UUID NOT NULL REFERENCES presences(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('tone', 'language', 'boundary', 'anchor', 'biography', 'care_signal')),
  question TEXT NOT NULL DEFAULT '' CHECK (length(question) <= 1000),
  answer TEXT NOT NULL CHECK (length(answer) BETWEEN 1 AND 4000),
  source TEXT NOT NULL DEFAULT 'family_onboarding'
    CHECK (source IN ('family_onboarding', 'family_app', 'elder_conversation', 'inferred')),
  confidence TEXT NOT NULL DEFAULT 'committed' CHECK (confidence IN ('committed', 'provisional', 'ask')),
  expires_at TIMESTAMPTZ,  -- only for provisional
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presence_facts_presence
  ON presence_facts(presence_id, kind)
  WHERE status = 'active';

-- One voice state per presence. Clone spend is gated deliberately (plan):
-- v1 stops at 'queued'; flipping queued -> ready is a policy change, not a bug.
CREATE TABLE IF NOT EXISTS presence_voice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_id UUID NOT NULL UNIQUE REFERENCES presences(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'none'
    CHECK (status IN ('none', 'samples_recorded', 'queued', 'ready', 'failed', 'revoked')),
  sample_count INT NOT NULL DEFAULT 0 CHECK (sample_count BETWEEN 0 AND 20),
  sample_seconds INT NOT NULL DEFAULT 0 CHECK (sample_seconds BETWEEN 0 AND 3600),
  elevenlabs_voice_id TEXT,
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The family channel: read aloud as coming from the author, never rewritten.
CREATE TABLE IF NOT EXISTS presence_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_id UUID NOT NULL REFERENCES presences(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'delivered', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_presence_notes_queue
  ON presence_notes(presence_id, created_at)
  WHERE status = 'queued';

-- RLS: defense-in-depth. The API goes through service_role (BYPASSRLS); these
-- policies exist so a leaked anon key still reads nothing.
ALTER TABLE presences ENABLE ROW LEVEL SECURITY;
ALTER TABLE presence_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE presence_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE presence_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE presence_voice ENABLE ROW LEVEL SECURITY;
ALTER TABLE presence_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'presences' AND policyname = 'service_role_all') THEN
    CREATE POLICY service_role_all ON presences FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY service_role_all ON presence_consents FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY service_role_all ON presence_people FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY service_role_all ON presence_facts FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY service_role_all ON presence_voice FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY service_role_all ON presence_notes FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
