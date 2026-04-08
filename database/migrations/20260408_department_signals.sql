-- Department Signals: cross-department communication for SoulOS
-- Enables departments to send typed signals to each other (e.g., Health -> Scheduling on low recovery)

CREATE TABLE IF NOT EXISTS department_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  from_department TEXT NOT NULL,
  to_department TEXT NOT NULL,
  signal_type TEXT NOT NULL, -- 'low_recovery', 'meeting_prep', 'content_opportunity', 'goal_progress', etc.
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  consumed BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_dept_signals_user ON department_signals(user_id, to_department) WHERE NOT consumed;
ALTER TABLE department_signals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY dept_signals_user ON department_signals FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
