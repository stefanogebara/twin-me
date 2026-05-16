-- Explicit deny-all RLS policies on user_subscriptions
-- ======================================================
-- Audit H1 (2026-05-15): the table has RLS enabled and a SELECT policy that
-- lets users read their own subscription, but it had NO policies for INSERT,
-- UPDATE, or DELETE. Default behavior with RLS enabled + no policies is
-- already DENY for authenticated/anon roles, so this isn't a runtime fix —
-- it's a *documentation* fix. The explicit deny policies make the intent
-- ("no browser client ever writes here; only the service role does") visible
-- in the schema so a future migration adding a permissive policy can't
-- silently open up the table.
--
-- supabaseAdmin uses the service role key which bypasses RLS, so the
-- webhook handler and /checkout writes are unaffected. The trigger function
-- public.create_free_user_subscription is SECURITY DEFINER and also bypasses.

drop policy if exists "No direct insert on user_subscriptions" on public.user_subscriptions;
create policy "No direct insert on user_subscriptions"
  on public.user_subscriptions for insert with check (false);

drop policy if exists "No direct update on user_subscriptions" on public.user_subscriptions;
create policy "No direct update on user_subscriptions"
  on public.user_subscriptions for update using (false);

drop policy if exists "No direct delete on user_subscriptions" on public.user_subscriptions;
create policy "No direct delete on user_subscriptions"
  on public.user_subscriptions for delete using (false);
