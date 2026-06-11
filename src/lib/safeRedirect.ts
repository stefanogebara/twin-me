// replan-2026-06-10 Track C: hosts for retired OAuth stacks (reddit, twitch,
// linkedin, notion, pinterest, strava, fitbit, soundcloud) removed — nothing
// redirects there anymore.
const TRUSTED_HOSTS = new Set([
  'accounts.google.com',
  'accounts.spotify.com',
  'discord.com',
  'github.com',
  'api.prod.whoop.com',
  'login.microsoftonline.com',
  'checkout.stripe.com',
  'billing.stripe.com',
]);

export function safeRedirect(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  // Relative paths (but not protocol-relative)
  if (url.startsWith('/') && !url.startsWith('//')) {
    window.location.href = url;
    return true;
  }
  // HTTPS with trusted host only
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (!TRUSTED_HOSTS.has(parsed.hostname)) {
      console.error('safeRedirect blocked untrusted host:', parsed.hostname);
      return false;
    }
    window.location.href = url;
    return true;
  } catch {
    return false;
  }
}
