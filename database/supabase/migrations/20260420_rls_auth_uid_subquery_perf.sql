-- RLS performance fix: wrap auth.uid() in SELECT subquery.
-- Per-row auth.uid() evaluation is slow on large tables (user_memories has
-- thousands of rows per user). Subquery form evaluates once per query.
-- Flagged by Supabase security advisor.

-- user_memories (4 policies)
DROP POLICY IF EXISTS "Users can view own memories" ON public.user_memories;
CREATE POLICY "Users can view own memories" ON public.user_memories
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own memories" ON public.user_memories;
CREATE POLICY "Users can insert own memories" ON public.user_memories
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own memories" ON public.user_memories;
CREATE POLICY "Users can update own memories" ON public.user_memories
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own memories" ON public.user_memories;
CREATE POLICY "Users can delete own memories" ON public.user_memories
  FOR DELETE USING ((SELECT auth.uid()) = user_id);
