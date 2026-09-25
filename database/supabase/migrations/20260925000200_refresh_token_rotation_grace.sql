-- A refresh token remembers the one it replaced, so two tabs stop signing each other out.
--
-- /refresh rotates on every call under an optimistic lock and answered 401 to the loser. A
-- browser keeps one cookie jar for every tab, so tabs raced on reload: reproduced on
-- production 2026-09-25, two concurrent POSTs answering 200 and 401. The losing tab latched
-- its refresh off for the page session and fell to sign-in, which is what "it signs me out
-- every time I refresh" was.
--
-- Rotation stays, because it is what makes a stolen refresh token detectable. The row now
-- carries the hash it just replaced and the moment it did, so a token presented moments
-- after its own rotation is answered (the same device asking twice) and one presented long
-- after is treated as reuse and revokes the session.
ALTER TABLE public.user_refresh_tokens
  ADD COLUMN IF NOT EXISTS previous_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ;

-- The grace lookup happens on every refresh that misses token_hash; without this it is a
-- sequential scan of every live session on the platform.
CREATE INDEX IF NOT EXISTS idx_user_refresh_tokens_previous_hash
  ON public.user_refresh_tokens (previous_token_hash)
  WHERE previous_token_hash IS NOT NULL;

COMMENT ON COLUMN public.user_refresh_tokens.previous_token_hash IS 'the hash this row held before its last rotation; accepted within ROTATION_GRACE_MS, reuse after';
COMMENT ON COLUMN public.user_refresh_tokens.rotated_at IS 'when previous_token_hash was replaced';
