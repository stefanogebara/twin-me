-- SoulOS Department System
-- Extends skill_definitions and agent_actions for department orchestration

-- 1. Department metadata on skills
ALTER TABLE skill_definitions ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'general';
ALTER TABLE skill_definitions ADD COLUMN IF NOT EXISTS enable_independent_proposals BOOLEAN DEFAULT FALSE;

-- 2. Department context on actions
ALTER TABLE agent_actions ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE agent_actions ADD COLUMN IF NOT EXISTS priority INT DEFAULT 5;
ALTER TABLE agent_actions ADD COLUMN IF NOT EXISTS estimated_cost_usd DECIMAL(8,4);

-- 3. Department budgets
CREATE TABLE IF NOT EXISTS department_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  monthly_budget_usd DECIMAL(10,2) DEFAULT 1.00,
  spent_this_month_usd DECIMAL(10,2) DEFAULT 0,
  reset_day INT DEFAULT 1,
  last_reset TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, department)
);

-- 4. Action cost log
CREATE TABLE IF NOT EXISTS action_cost_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  department TEXT,
  tool_name TEXT NOT NULL,
  cost_usd DECIMAL(8,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dept_budgets_user ON department_budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_action_cost_user_month ON action_cost_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_actions_dept ON agent_actions(department) WHERE department IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_actions_pending ON agent_actions(user_id) WHERE user_response IS NULL;

-- RLS
ALTER TABLE department_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_cost_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY department_budgets_user_policy ON department_budgets
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY action_cost_log_user_policy ON action_cost_log
  FOR ALL USING (user_id = auth.uid());
