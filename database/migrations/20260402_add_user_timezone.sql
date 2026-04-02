-- Add timezone column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT NULL;

-- Comment
COMMENT ON COLUMN public.users.timezone IS 'IANA timezone string (e.g. America/Sao_Paulo), detected from browser';
