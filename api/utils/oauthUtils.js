// Returns the canonical app base URL for OAuth redirect_uris and post-login
// res.redirect() calls.
//
// SECURITY (open redirect / redirect_uri injection): the Host and Origin
// request headers are attacker-controllable, so they must NEVER be reflected
// into the returned URL. A request carrying `Host: evil.com` (or
// `Origin: https://evil.com`) to an OAuth-callback route would otherwise turn
// `res.redirect(`${getAppUrl(req)}/...`)` into an open redirect and let a
// forged `redirect_uri` be sent to providers. Here the Host header only STEERS
// which trusted constant is returned — it is never interpolated into the
// output, so the worst a forged host achieves is selecting one of OUR own
// URLs. Mirrors resolveAppUrl() in routes/auth-simple.js; keep the two
// allowlists in sync.
//
// Priority: APP_URL env > twinme.me apex > vercel.app canonical alias >
// VITE_APP_URL > localhost. `env` is injectable for testing (defaults to
// process.env).
export function getAppUrl(req, env = process.env) {
  // Strip a leading www. so callbacks land on the apex domain the OAuth apps
  // are registered against (twinme.me/oauth/callback, not www.twinme.me/...).
  const stripWww = (u) => u.replace(/^(https?:\/\/)www\./, '$1');

  // Explicit deploy-time override always wins.
  if (env.APP_URL) return stripWww(env.APP_URL);

  const host = req?.headers?.host || '';
  // Production custom domain — matches twinme.me and www.twinme.me alike.
  if (host.includes('twinme.me')) return 'https://twinme.me';
  // Any Vercel host (including per-deploy preview URLs) resolves to the
  // canonical production alias registered in the providers' OAuth configs —
  // NOT the deployment-specific hostname, which no provider would accept.
  if (host.includes('vercel.app')) return 'https://twin-ai-learn.vercel.app';

  // Local development, or any unknown/forged host: never reflect it — fall
  // back to the configured app URL (localhost in dev).
  return stripWww(env.VITE_APP_URL || 'http://localhost:8086');
}
