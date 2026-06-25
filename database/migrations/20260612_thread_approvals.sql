-- One-interface (2026-06-12): the /inbox page is gone; proposals are offered
-- and resolved in the WhatsApp thread. Track when a pending proposal was
-- offered via WhatsApp so (a) we never re-offer the same proposal, and
-- (b) a short "yes"/"skip" reply can be matched to the awaiting proposal.
ALTER TABLE agent_actions
  ADD COLUMN IF NOT EXISTS wa_delivered_at TIMESTAMPTZ;

-- Fast lookup of the proposal awaiting a thread reply (pending + offered).
CREATE INDEX IF NOT EXISTS idx_agent_actions_wa_awaiting
  ON agent_actions (user_id, wa_delivered_at DESC)
  WHERE user_response IS NULL AND wa_delivered_at IS NOT NULL;
