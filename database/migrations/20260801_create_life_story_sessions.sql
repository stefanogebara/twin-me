-- Story Chapters — chaptered life-story interview persistence.
-- Plan: .claude/plans/2026-08-01-twin-interview/README.md (Phase 1).
--
-- life_story_state: one row per user — the running interviewer "reflection
-- notes" (compact fact dictionary carried across chapters, Park et al. 2024
-- context-compression pattern), completed chapters, and nudge bookkeeping
-- (per-chapter {sent, ignored} counters for the Phase 3 twin-initiated
-- prompts, cooldown-gated).
--
-- life_story_sessions: one row per chapter attempt. The transcript lives
-- here while the chapter is active; on completion it is written into the
-- memory stream and the row is kept for resume/audit. A redo creates a new
-- row (append-only attempt history).
--
-- Interview transcripts are sensitive → RLS enabled deny-by-default,
-- matching the PII posture of twin_actions / reminders / twin_calls. The
-- app authenticates with a custom JWT (auth.uid() is null) and all access
-- goes through supabaseAdmin (service_role), which bypasses RLS.

create table if not exists public.life_story_state (
  user_id            uuid primary key references public.users(id) on delete cascade,
  reflection_notes   jsonb not null default '{}'::jsonb,
  chapters_completed text[] not null default '{}',
  nudges             jsonb not null default '{}'::jsonb,
  updated_at         timestamptz not null default now()
);

create table if not exists public.life_story_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  chapter_id     text not null,
  status         text not null default 'active'
                   check (status in ('active','completed','abandoned')),
  transcript     jsonb not null default '[]'::jsonb,
  question_index int not null default 0,
  followups_used int not null default 0,
  started_at     timestamptz not null default now(),
  completed_at   timestamptz
);

-- Resume query: the user's active session for a chapter, newest first.
create index if not exists idx_life_story_sessions_user_chapter
  on public.life_story_sessions (user_id, chapter_id, status, started_at desc);

alter table public.life_story_state enable row level security;
alter table public.life_story_sessions enable row level security;

comment on table public.life_story_state is
  'Story Chapters interview — per-user running reflection notes, completed chapters, nudge counters.';
comment on table public.life_story_sessions is
  'Story Chapters interview — one row per chapter attempt; transcript held here until chapter completion writes it to the memory stream.';
