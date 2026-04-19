// Returns the app's base URL derived from the incoming request.
// Checks origin, then host header, then env fallback.
// This ensures OAuth callbacks work on twinme.me, vercel previews, and localhost.
export function getAppUrl(req) {
  if (req?.headers?.origin) return req.headers.origin;

  const host = req?.headers?.host;
  if (host) {
    const proto = host.includes('localhost') ? 'http' : 'https';
    return `${proto}://${host}`;
  }

  return process.env.VITE_APP_URL || 'http://localhost:8086';
}
