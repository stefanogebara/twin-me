-- Stripe webhook idempotency table
-- ==================================
-- Audit C1 (2026-05-15): the webhook handler never tracked processed events,
-- so a Stripe retry of `customer.subscription.deleted` (Stripe retries failed
-- deliveries for up to 3 days) could downgrade a paying user back to 'free'
-- and null out their stripe_subscription_id. constructEvent verifies the
-- signature but says nothing about "already saw this event".
--
-- Solution: every webhook records event.id here. The route uses
-- INSERT ... ON CONFLICT DO NOTHING and treats a conflict as "already
-- processed" — short-circuits to 200 without re-running the handler.

create table if not exists public.stripe_webhook_events (
  event_id    text primary key,
  event_type  text not null,
  received_at timestamptz not null default now()
);

-- Bounded retention: rows older than ~30 days are useless (Stripe's retry
-- window is 3 days). A periodic cleanup is cheaper than growing forever.
create index if not exists idx_stripe_webhook_events_received_at
  on public.stripe_webhook_events (received_at);

alter table public.stripe_webhook_events enable row level security;

-- No browser client ever writes here; the service-role key bypasses RLS.
-- Explicit deny-all policies document the intent so a future migration
-- adding a permissive policy won't accidentally expose the table.
drop policy if exists "No direct insert on stripe_webhook_events" on public.stripe_webhook_events;
create policy "No direct insert on stripe_webhook_events"
  on public.stripe_webhook_events for insert with check (false);

drop policy if exists "No direct select on stripe_webhook_events" on public.stripe_webhook_events;
create policy "No direct select on stripe_webhook_events"
  on public.stripe_webhook_events for select using (false);
