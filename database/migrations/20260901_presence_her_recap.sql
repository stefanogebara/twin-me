-- Presence: a recap written for HER, not for the family
-- =====================================================
-- `summary` and `needs_family` are the family's digest — they contain analysis of her
-- (worries, health mentions, emotional withdrawal). Her own home screen must never
-- render that. `her_recap` is one warm line in her language, produced by the same
-- summarizer pass, safe to show on /call/:token.

ALTER TABLE presence_conversations ADD COLUMN IF NOT EXISTS her_recap TEXT NOT NULL DEFAULT '';
