// Returns the canonical app base URL derived from the incoming request.
// Strips www. prefix so OAuth redirect URIs match the apex-domain registration
// (twinme.me/oauth/callback, not www.twinme.me/oauth/callback).
export function getAppUrl(req) {
  const raw = req?.headers?.origin || (() => {
    const host = req?.headers?.host;
    if (!host) return process.env.VITE_APP_URL || 'http://localhost:8086';
    const proto = host.includes('localhost') ? 'http' : 'https';
    return `${proto}://${host}`;
  })();

  // Normalise: strip www. so callbacks always land on the apex domain
  return raw.replace(/^(https?:\/\/)www\./, '$1');
}
