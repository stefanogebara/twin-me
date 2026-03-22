// api/services/emailService.js
import { Resend } from 'resend';
import crypto from 'crypto';
import { createLogger } from './logger.js';

const log = createLogger('Email');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
if (!resend) log.warn('RESEND_API_KEY not set — email sending disabled');
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
    .map(text => `<div class="card"><p style="font-size:16px;line-height:1.6;margin:0">${escapeHtml(text.slice(0, 300))}</p></div>`)
    .join('');

  return resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `Your twin noticed something this week, ${escapeHtml(firstName)}`,
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
<p style="color:#9ca3af;margin-bottom:28px;font-size:15px">Hey ${escapeHtml(firstName)} — here's what your twin noticed this week.</p>
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

/**
 * Welcome email for new beta users.
 * @param {object} opts
 * @param {string} opts.toEmail
 * @param {string} opts.firstName
 */
export async function sendWelcomeEmail({ toEmail, firstName }) {
  if (!resend) return; // Silently skip if no Resend key

  const safeName = escapeHtml(firstName || 'there');

  try {
    await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `Welcome to TwinMe, ${safeName}`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:0}
.c{max-width:600px;margin:0 auto;padding:40px 24px}
.logo{font-size:20px;font-weight:700;color:#ffffff;margin-bottom:32px}
.cta{display:inline-block;background:#ffffff;color:#1b1818;text-decoration:none;padding:14px 32px;border-radius:100px;font-weight:600;margin-top:24px;font-size:16px}
.footer{margin-top:40px;font-size:12px;color:#4b5563;line-height:1.6}
</style></head><body><div class="c">
<div class="logo">TwinMe</div>
<p style="font-size:18px;line-height:1.6;margin-bottom:8px">Hey ${safeName},</p>
<p style="color:#9ca3af;font-size:15px;line-height:1.6">Welcome to TwinMe &mdash; you're one of the first people to try this. Your digital twin is now live and learning about you.</p>
<p style="color:#9ca3af;font-size:15px;line-height:1.6">Here's how to get the most out of it:</p>
<ul style="color:#9ca3af;font-size:14px;line-height:1.8;padding-left:20px">
  <li><strong style="color:#e5e5e5">Connect platforms</strong> &mdash; Spotify, YouTube, Gmail give your twin real context</li>
  <li><strong style="color:#e5e5e5">Chat with your twin</strong> &mdash; the more you talk, the better it knows you</li>
  <li><strong style="color:#e5e5e5">Give feedback</strong> &mdash; use the Feedback button anytime</li>
</ul>
<a href="${APP_URL}/dashboard" class="cta">Open your dashboard</a>
<div class="footer">
  <p>You're part of a small group shaping what TwinMe becomes. We read every piece of feedback.</p>
  <p style="color:#374151">TwinMe &mdash; discover what makes you, you.</p>
</div>
</div></body></html>`,
    });
  } catch (err) {
    // Non-blocking — don't fail signup if email fails
    log.error('Welcome email failed', { error: err.message, email: toEmail });
  }
}

/**
 * Beta invite email.
 * @param {object} opts
 * @param {string} opts.toEmail
 * @param {string} opts.firstName
 * @param {string} opts.inviteCode
 */
export async function sendBetaInvite({ toEmail, firstName, inviteCode }) {
  if (!resend) { log.warn('Skipping beta invite email (Resend not configured)'); return; }

  const safeName = escapeHtml(firstName || 'there');
  const safeCode = escapeHtml(inviteCode);
  const inviteUrl = `${APP_URL}/auth?invite=${encodeURIComponent(inviteCode)}`;

  return resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${safeName}, you're invited to TwinMe`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:0}
.c{max-width:600px;margin:0 auto;padding:40px 24px}
.logo{font-size:20px;font-weight:700;color:#ffffff;margin-bottom:32px}
.card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;padding:24px;margin:24px 0;text-align:center}
.code{font-size:28px;font-weight:700;letter-spacing:4px;color:#ffffff;margin:12px 0}
.code-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:#6b7280}
.cta{display:inline-block;background:#ffffff;color:#1b1818;text-decoration:none;padding:14px 32px;border-radius:100px;font-weight:600;margin-top:24px;font-size:16px}
.footer{margin-top:40px;font-size:12px;color:#4b5563;line-height:1.6}
</style></head><body><div class="c">
<div class="logo">TwinMe</div>
<p style="font-size:18px;line-height:1.6;margin-bottom:8px">Hey ${safeName},</p>
<p style="color:#9ca3af;font-size:15px;line-height:1.6;margin-bottom:0">You've been selected for early access to TwinMe — an AI twin that actually knows you. We're starting small (just a handful of people) so we can get this right.</p>
<div class="card">
  <div class="code-label">Your invite code</div>
  <div class="code">${safeCode}</div>
</div>
<p style="color:#9ca3af;font-size:14px">Click below to get started. Your code will be applied automatically.</p>
<a href="${inviteUrl}" class="cta">Start your twin journey</a>
<div class="footer">
  <p>This invite is personal — it can only be used once.</p>
  <p style="color:#374151">TwinMe — discover what makes you, you.</p>
</div>
</div></body></html>`,
  });
}
