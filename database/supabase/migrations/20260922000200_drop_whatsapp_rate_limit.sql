-- Drop the WhatsApp rate limiter that was never wired up (2026-09-22).
--
-- whatsapp_rate_limit and its two functions were built to replace the in-memory Map in
-- whatsappInboundPipeline.js, which does not hold across Vercel's serverless instances.
-- The switchover never happened: nothing in the repository calls them, the table never
-- took a row, and the Map is still what limits inbound WhatsApp.
--
-- They were also the only SECURITY DEFINER functions here executable by anon and
-- authenticated, so any holder of the public key could bump an arbitrary phone's counter
-- or empty the table. Dead and reachable is worse than dead, so both go. When the limiter
-- is made durable it comes back with EXECUTE granted to service_role alone.

DROP FUNCTION IF EXISTS public.whatsapp_rate_bump(text, integer);
DROP FUNCTION IF EXISTS public.whatsapp_rate_limpar(integer);
DROP TABLE IF EXISTS public.whatsapp_rate_limit;
