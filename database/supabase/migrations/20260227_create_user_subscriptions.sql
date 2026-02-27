-- subscription_plan type (subscription_status already existed)
do $$ begin
  if not exists (select 1 from pg_type where typname = 'subscription_plan') then
    create type subscription_plan as enum ('free', 'pro', 'max');
  end if;
end $$;

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan subscription_plan not null default 'free',
  status subscription_status not null default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create or replace function public.create_free_user_subscription()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_subscriptions (user_id, plan, status)
  values (new.id, 'free', 'active')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_user_created_user_subscription on public.users;
create trigger on_user_created_user_subscription
  after insert on public.users
  for each row execute procedure public.create_free_user_subscription();

alter table public.user_subscriptions enable row level security;

drop policy if exists "Users can read own user_subscription" on public.user_subscriptions;
create policy "Users can read own user_subscription" on public.user_subscriptions
  for select using (user_id = auth.uid());
