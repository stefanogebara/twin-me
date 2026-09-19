-- Presence: an emergency contact (plan 2026-09-15-presence-forward, README 8, Phase 2 T8)
-- ======================================================================================
-- Who the presence says it will tell "agora" when she speaks of strong pain, a
-- fall, or asks for help. The brief names them; the tripwire and the urgent
-- WhatsApp message reach the family either way. Presence is not an emergency
-- service, and the brief says so to her too.

ALTER TABLE presences
  ADD COLUMN IF NOT EXISTS emergency_name TEXT
    CHECK (emergency_name IS NULL OR length(emergency_name) <= 120),
  ADD COLUMN IF NOT EXISTS emergency_phone TEXT
    CHECK (emergency_phone IS NULL OR emergency_phone ~ '^\+[1-9][0-9]{7,14}$');
