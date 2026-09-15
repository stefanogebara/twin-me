-- The person's word on a place lives in money_place_overrides since 2026-09-15 (#372); the shared column goes.
ALTER TABLE public.money_places DROP COLUMN IF EXISTS category_override;
ALTER TABLE public.money_places DROP COLUMN IF EXISTS overridden_at;
