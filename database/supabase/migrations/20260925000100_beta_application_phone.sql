-- Which phone a beta applicant carries, asked on /beta since 2026-09-25.
--
-- It decides how a payment reaches the ledger at all: Android runs the app that reads the
-- bank's notifications, an iPhone runs a signed Wallet Shortcut and only for Apple Pay. The
-- form asked for eight OAuth platforms that have not been connectable since the twin was
-- parked; it now asks what the ledger can actually read, and the phone is the one answer
-- that has no home in the platforms array because it is a choice of one, not a set.
ALTER TABLE public.beta_applications
  ADD COLUMN IF NOT EXISTS phone TEXT;

COMMENT ON COLUMN public.beta_applications.phone IS 'ios | android | null (not answered)';
