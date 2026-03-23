-- =============================================================================
-- ENABLE RLS ON PHASE 8 AGENTIC TABLES
-- Audit finding C3: 9 tables created without Row Level Security
-- All access currently goes through supabaseAdmin (service_role), but
-- defense-in-depth requires RLS on all user data tables.
-- =============================================================================

-- 1. core_memory_blocks
ALTER TABLE core_memory_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON core_memory_blocks
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Users read own blocks" ON core_memory_blocks
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users update own blocks" ON core_memory_blocks
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()));

-- 2. prospective_memories
ALTER TABLE prospective_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON prospective_memories
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Users read own memories" ON prospective_memories
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- 3. agent_actions
ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON agent_actions
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Users read own actions" ON agent_actions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- 4. skill_definitions (shared — all authenticated users can read)
ALTER TABLE skill_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON skill_definitions
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users read skills" ON skill_definitions
  FOR SELECT TO authenticated USING (true);

-- 5. user_skill_settings
ALTER TABLE user_skill_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON user_skill_settings
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Users manage own settings" ON user_skill_settings
  FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- 6. agent_events
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON agent_events
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Users read own events" ON agent_events
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- 7. user_finetuned_models
ALTER TABLE user_finetuned_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON user_finetuned_models
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Users read own models" ON user_finetuned_models
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- 8. preference_pairs
ALTER TABLE preference_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON preference_pairs
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Users read own pairs" ON preference_pairs
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- 9. chat_message_feedback
ALTER TABLE chat_message_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON chat_message_feedback
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Users manage own feedback" ON chat_message_feedback
  FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
