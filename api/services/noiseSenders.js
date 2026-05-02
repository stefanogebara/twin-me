/**
 * Shared noise-sender filter used by inbox triage and the relationships
 * agent. Anything matched here is automation, not a person waiting on you.
 *
 * Keep this list narrow — false-positives here mean real humans get hidden
 * from the dashboard. False-negatives are cheaper (one extra LLM scoring call
 * for the inbox card; one wrongly-surfaced "person waiting" for relationships).
 */

export const NOISE_PATTERNS = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'notifications@', 'newsletter', 'updates@', 'hello@mail',
  'support@', 'info@mail', 'mailer@', 'bounce@', 'mailchimp',
  'sendgrid', 'beehiiv', 'substack.com', 'github.com',
  'linkedin.com', 'twitter.com', 'instagram.com', 'facebook.com',
  'samsung', 'glovo', 'uber', 'ifood', 'amazon',
];

export function isNoise(from = '') {
  const f = from.toLowerCase();
  return NOISE_PATTERNS.some(p => f.includes(p));
}
