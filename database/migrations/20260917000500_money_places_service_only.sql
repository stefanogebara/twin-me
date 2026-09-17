-- The shared cache is written/read by the authenticated Money API's service role.
-- A public table without RLS inherited public write grants in the live project.
-- This migration changes access only; it never changes or removes place records.
ALTER TABLE public.money_places ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.money_places FROM anon, authenticated;
GRANT ALL ON TABLE public.money_places TO service_role;
DROP POLICY IF EXISTS money_places_service_all ON public.money_places;
CREATE POLICY money_places_service_all ON public.money_places
  FOR ALL TO service_role USING (true) WITH CHECK (true);
