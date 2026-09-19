-- Presence: the people around her — members and their roles
-- ============================================================
-- Plan 2026-09-15-presence-forward, README 7.3, Phase 2 (PHASE-2.md, T3).
--
-- presence_members
--   Who may see and act on a presence besides its owner. owner: everything.
--   family (a sibling, a grandchild): notes, summaries, asks. companion (the
--   acompanhante, the cuidadora): notes and the "needs a person" list only,
--   never the transcripts. The owner row is written for every existing
--   presence so one query answers "what may this user see".
--
-- presence_invites
--   A link the owner sends by WhatsApp. Accepting it writes the member row;
--   the token is single-use and expires in seven days.

CREATE TABLE IF NOT EXISTS presence_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_id UUID NOT NULL REFERENCES presences(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'family', 'companion')),
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (presence_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_presence_members_user ON presence_members(user_id);

CREATE TABLE IF NOT EXISTS presence_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_id UUID NOT NULL REFERENCES presences(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('family', 'companion')),
  token TEXT NOT NULL UNIQUE CHECK (length(token) BETWEEN 20 AND 64),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presence_invites_presence ON presence_invites(presence_id);

ALTER TABLE presence_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE presence_invites ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'presence_members' AND policyname = 'service_role_all') THEN
    CREATE POLICY service_role_all ON presence_members FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'presence_invites' AND policyname = 'service_role_all') THEN
    CREATE POLICY service_role_all ON presence_invites FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Every existing presence: its owner is a member with the owner role.
INSERT INTO presence_members (presence_id, user_id, role)
SELECT id, owner_user_id, 'owner' FROM presences
ON CONFLICT (presence_id, user_id) DO NOTHING;
