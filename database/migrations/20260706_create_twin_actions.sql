-- twin_actions — the action inbox for the M1 voice-reply skill.
--
-- Each row is ONE twin action awaiting the user's approval (M1: type='voice_reply').
-- The twin never auto-sends; a row stays `pending` until the user approves
-- (Send), edits (Edit → final_text), or rejects (Reject → reject_reason). The
-- edit/reject signal feeds the twin_directives learning loop (twinSelfImprovement).
--
-- Draft content is sensitive → RLS enabled deny-by-default, matching the PII
-- posture of reminders / twin_calls (audit M0.3). The app authenticates with a
-- custom JWT (auth.uid() is null) and all access goes through supabaseAdmin
-- (service_role), which bypasses RLS.

create table if not exists public.twin_actions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  type          text not null default 'voice_reply'
                  check (type in ('voice_reply')),
  status        text not null default 'pending'
                  check (status in ('pending','sent','edited','rejected')),
  channel       text not null default 'gmail'
                  check (channel in ('gmail','whatsapp')),
  thread_ref    text,
  recipient     text,
  draft_text    text not null,
  final_text    text,                                  -- actually-sent text (for the edit diff)
  why_signals   jsonb not null default '[]'::jsonb,    -- [{kind, note}] shown beside the draft
  reject_reason text,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

-- Inbox query: a user's pending actions, newest first.
create index if not exists idx_twin_actions_user_status
  on public.twin_actions (user_id, status, created_at desc);

alter table public.twin_actions enable row level security;

comment on table public.twin_actions is
  'M1 action inbox — pending twin actions (voice_reply) awaiting user approval. Never auto-sent.';
