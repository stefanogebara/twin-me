/**
 * Shared noise-sender filter used by inbox triage and the relationships
 * agent. Anything matched here is automation, not a person waiting on you.
 *
 * Keep this list narrow — false-positives here mean real humans get hidden
 * from the dashboard. False-negatives are cheaper (one extra LLM scoring call
 * for the inbox card; one wrongly-surfaced "person waiting" for relationships).
 *
 * Audit 2026-05-21: prod "5 people waiting on you" included AliExpress,
 * Info Acekia (restaurant booking), PS_Exams.Services (exam service),
 * ♟Chess.com — all vendor automation, not humans. Added below.
 */

export const NOISE_PATTERNS = [
  // Generic automation prefixes
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'no_reply',
  'notifications@', 'newsletter', 'updates@', 'hello@mail',
  'support@', 'info@mail', 'mailer@', 'mailer-daemon', 'bounce@', 'mailchimp',
  'sendgrid', 'beehiiv', 'alert@', 'alerts@',
  // Vendor-style "info"/"team"/"ops" mailboxes — almost always vendor
  // automation in our corpus.
  'info@', 'team@', 'ops@', 'marketing@',
  // Social platforms (notifications, not humans)
  'substack.com', 'github.com', 'linkedin.com', 'twitter.com',
  'instagram.com', 'facebook.com', 'chess.com',
  // E-commerce / consumer apps
  'samsung', 'glovo', 'uber', 'ifood', 'amazon', 'aliexpress',
  // Restaurant booking platforms (Info Acekia in the audit was a Spanish
  // restaurant booking confirmation, framed as "Re: Reserva...")
  'opentable', 'sevenrooms', 'resy', 'thefork',
  // Exam / education service senders (PS_Exams in audit)
  'ps_exams', 'ps-exams', 'cambridgeenglish', 'britishcouncil-noreply',
  // AI-assistant notification bots (replan-2026-06-10: the twin drafted a
  // reply to askjo.ai's daily briefing email — bot answering bot in the
  // user's voice, committing him to work he never saw).
  'askjo.ai',
];

/**
 * Match noise patterns against the raw `from` field (which may include a
 * display name like "AliExpress <alerts@aliexpress.com>"). Case-insensitive
 * substring match.
 */
export function isNoise(from = '') {
  const f = from.toLowerCase();
  return NOISE_PATTERNS.some(p => f.includes(p));
}
