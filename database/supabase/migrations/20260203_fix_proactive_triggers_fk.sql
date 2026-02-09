-- ============================================
-- Fix proactive_triggers foreign key constraint
-- Migration: 20260203
--
-- Problem: The proactive_triggers table FK references
-- public.users instead of auth.users, causing inserts to fail
-- when the user only exists in auth.users
--
-- Solution: Drop and recreate FK to reference auth.users
-- ============================================

-- Drop the incorrect FK constraint if it exists
ALTER TABLE proactive_triggers
DROP CONSTRAINT IF EXISTS proactive_triggers_user_id_fkey;

-- Add correct FK constraint referencing auth.users
ALTER TABLE proactive_triggers
ADD CONSTRAINT proactive_triggers_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Also fix trigger_executions FK if it has the same issue
ALTER TABLE trigger_executions
DROP CONSTRAINT IF EXISTS trigger_executions_user_id_fkey;

ALTER TABLE trigger_executions
ADD CONSTRAINT trigger_executions_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Verify the constraints
COMMENT ON TABLE proactive_triggers IS 'User-defined automation rules - FK references auth.users';
COMMENT ON TABLE trigger_executions IS 'Audit trail for trigger activations - FK references auth.users';
