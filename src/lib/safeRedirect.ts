const TRUSTED_HOSTS = new Set([
  'accounts.google.com',
  'accounts.spotify.com',
  'discord.com',
  'www.reddit.com',
  'github.com',
  'api.twitch.tv',
  'www.linkedin.com',
  'api.notion.com',
  'www.pinterest.com',
  'www.strava.com',
  'www.fitbit.com',
  'api.prod.whoop.com',
  'login.microsoftonline.com',
  'soundcloud.com',
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
