// api/services/emailService.js
import { Resend } from 'resend';
import crypto from 'crypto';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
if (!resend) console.warn('[EmailService] RESEND_API_KEY not set — email sending disabled');
const FROM = process.env.RESEND_FROM_EMAIL || 'twin@twinme.me';
const APP_URL = process.env.VITE_APP_URL || 'https://twin-ai-learn.vercel.app';

/**
 * Generate a signed unsubscribe token for a user.
 * Stateless — verifiable without DB lookup.
 */
export function generateUnsubscribeToken(userId) {
  const secret = process.env.CRON_SECRET || process.env.JWT_SECRET || 'fallback';
  return crypto.createHmac('sha256', secret).update(userId).digest('hex');
}

export function verifyUnsubscribeToken(userId, token) {
  return generateUnsubscribeToken(userId) === token;
}

/**
 * Weekly digest email.
 * @param {object} opts
 * @param {string}   opts.toEmail
 * @param {string}   opts.firstName
 * @param {string[]} opts.reflections  — top 3 reflection strings
 * @param {number}   opts.newMemories  — count of new memories this week
 * @param {string}   opts.userId       — for opt-out link
 */
export async function sendWeeklyDigest({ toEmail, firstName, reflections, newMemories, userId }) {
  if (!resend) throw new Error('Email service not configured');

  const unsubToken = generateUnsubscribeToken(userId);
  const unsubUrl = `${APP_URL}/api/email/unsubscribe?uid=${userId}&token=${unsubToken}`;

  const reflectionCards = reflections
    .slice(0, 3)
    .map(text => `<div class="card"><p style="font-size:16px;line-height:1.6;margin:0">${text.slice(0, 300)}</p></div>`)
    .join('');

  return resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `Your twin noticed something this week, ${firstName}`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:0}
.c{max-width:600px;margin:0 auto;padding:40px 24px}
.logo{font-size:20px;font-weight:700;color:#818cf8;margin-bottom:32px}
.card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;padding:20px 24px;margin-bottom:12px}
.section-lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;margin-bottom:16px}
.cta{display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;margin-top:24px}
.footer{margin-top:40px;font-size:12px;color:#4b5563;line-height:1.6}
</style></head><body><div class="c">
<div class="logo">TwinMe</div>
<p style="color:#9ca3af;margin-bottom:28px;font-size:15px">Hey ${firstName} — here's what your twin noticed this week.</p>
<div class="section-lbl">This week's reflections</div>
${reflectionCards}
${newMemories > 0 ? `<p style="color:#6b7280;font-size:13px;margin-top:8px">+${newMemories} new memories added this week.</p>` : ''}
<br>
<a href="${APP_URL}/talk-to-twin" class="cta">Talk to your twin →</a>
<div class="footer">
  <p>You're receiving this because you use TwinMe.</p>
  <p><a href="${unsubUrl}" style="color:#4b5563">Unsubscribe from weekly emails</a></p>
</div>
</div></body></html>`,
  });
}
