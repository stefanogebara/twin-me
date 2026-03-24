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
const LOGO_URL = `${APP_URL}/images/backgrounds/flower.png`;

// ============================================================================
// Shared email shell — fully inline styles, table-based for email client compat
// Black bg (#0C0C0C), white text, Instrument Serif headings, Inter body
// ============================================================================

function emailShell(bodyContent) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>TwinMe</title>
<!--[if mso]>
<style>* { font-family: Arial, sans-serif !important; }</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#0C0C0C;color:#F5F5F4;font-family:'Inter',Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0C0C0C;">
<tr>
<td align="center" style="padding:0;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:#0C0C0C;">
<tr>
<td style="padding:48px 28px 40px;background-color:#0C0C0C;">

  <!-- Logo -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:40px;">
  <tr>
    <td style="vertical-align:middle;padding-right:10px;">
      <img src="${LOGO_URL}" alt="" width="28" height="28" style="width:28px;height:28px;border-radius:50%;display:block;" />
    </td>
    <td style="vertical-align:middle;font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:-0.5px;color:#F5F5F4;">
      TwinMe
    </td>
  </tr>
  </table>

  ${bodyContent}

</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

// Reusable inline style fragments
const S = {
  heading: "font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:28px;letter-spacing:-0.5px;color:#F5F5F4;margin:0 0 8px;line-height:1.3;",
  subheading: "font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:20px;letter-spacing:-0.3px;color:#F5F5F4;margin:32px 0 16px;line-height:1.3;",
  body: "font-family:'Inter',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#9C9590;margin:0 0 16px;",
  card: "background-color:#141414;border:1px solid #1E1E1E;border-radius:16px;padding:20px 24px;margin-bottom:12px;",
  cardText: "font-family:'Inter',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#C4BFBA;margin:0;",
  label: "font-family:'Inter',Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#57534E;margin:0 0 14px;",
  codeCard: "background-color:#141414;border:1px solid #1E1E1E;border-radius:16px;padding:28px;margin:24px 0;text-align:center;",
  codeLabel: "font-family:'Inter',Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#57534E;margin:0;",
  codeValue: "font-family:'Inter',Arial,monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:#F5F5F4;margin:14px 0 0;",
  cta: "display:inline-block;background-color:#F5F5F4;color:#0C0C0C;text-decoration:none;padding:14px 36px;border-radius:100px;font-weight:600;font-size:15px;font-family:'Inter',Arial,Helvetica,sans-serif;",
  divider: "height:1px;background-color:#1E1E1E;margin:36px 0;border:none;",
  footer: "font-family:'Inter',Arial,Helvetica,sans-serif;font-size:12px;color:#3D3835;line-height:1.7;margin-top:40px;",
  footerLink: "color:#3D3835;text-decoration:underline;",
  listItem: "font-family:'Inter',Arial,Helvetica,sans-serif;font-size:14px;line-height:1.8;color:#878279;margin:0 0 4px;",
  listStrong: "color:#F5F5F4;font-weight:500;",
};


/**
 * Generate a signed unsubscribe token for a user.
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
 */
export async function sendWeeklyDigest({ toEmail, firstName, reflections, newMemories, userId }) {
  if (!resend) throw new Error('Email service not configured');

  const unsubToken = generateUnsubscribeToken(userId);
  const unsubUrl = `${APP_URL}/api/email/unsubscribe?uid=${userId}&token=${unsubToken}`;
  const safeName = escapeHtml(firstName);

  const reflectionCards = reflections
    .slice(0, 3)
    .map(text => `
      <div style="${S.card}">
        <p style="${S.cardText}">${escapeHtml(text.slice(0, 300))}</p>
      </div>`)
    .join('');

  const body = `
  <p style="${S.heading}">Your twin noticed something, ${safeName}</p>
  <p style="${S.body}">Here's what stood out this week.</p>

  <div style="${S.divider}"></div>

  <p style="${S.label}">This week's reflections</p>
  ${reflectionCards}
  ${newMemories > 0 ? `<p style="font-family:'Inter',Arial,sans-serif;font-size:13px;color:#57534E;margin-top:8px;">+${newMemories} new memories this week</p>` : ''}

  <div style="margin-top:28px;">
    <a href="${APP_URL}/talk-to-twin" style="${S.cta}">Talk to your twin</a>
  </div>

  <div style="${S.footer}">
    <p style="margin:0 0 4px;">You're receiving this because you use TwinMe.</p>
    <p style="margin:0;"><a href="${unsubUrl}" style="${S.footerLink}">Unsubscribe from weekly emails</a></p>
  </div>`;

  return resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `Your twin noticed something this week, ${safeName}`,
    html: emailShell(body),
  });
}

/**
 * Welcome email for new beta users.
 */
export async function sendWelcomeEmail({ toEmail, firstName }) {
  if (!resend) return;

  const safeName = escapeHtml(firstName || 'there');

  const body = `
  <p style="${S.heading}">Welcome, ${safeName}</p>
  <p style="${S.body}">You're one of the first people to try TwinMe. Your digital twin is now live and learning about you.</p>

  <div style="${S.divider}"></div>

  <p style="${S.subheading}">Get the most out of it</p>

  <p style="${S.listItem}"><span style="${S.listStrong}">Connect platforms</span> &mdash; Spotify, YouTube, Gmail give your twin real context</p>
  <p style="${S.listItem}"><span style="${S.listStrong}">Chat with your twin</span> &mdash; the more you talk, the better it knows you</p>
  <p style="${S.listItem}"><span style="${S.listStrong}">Give feedback</span> &mdash; use the feedback button anytime</p>

  <div style="margin-top:28px;">
    <a href="${APP_URL}/dashboard" style="${S.cta}">Open your dashboard</a>
  </div>

  <div style="${S.footer}">
    <p style="margin:0 0 4px;">You're part of a small group shaping what TwinMe becomes. We read every piece of feedback.</p>
    <p style="margin:0;color:#2A2624;">TwinMe &mdash; discover what makes you, you.</p>
  </div>`;

  try {
    await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `Welcome to TwinMe, ${safeName}`,
      html: emailShell(body),
    });
  } catch (err) {
    log.error('Welcome email failed', { error: err.message, email: toEmail });
  }
}

/**
 * Beta invite email.
 */
export async function sendBetaInvite({ toEmail, firstName, inviteCode }) {
  if (!resend) { log.warn('Skipping beta invite email (Resend not configured)'); return; }

  const safeName = escapeHtml(firstName || 'there');
  const safeCode = escapeHtml(inviteCode);
  const inviteUrl = `${APP_URL}/auth?invite=${encodeURIComponent(inviteCode)}`;

  const body = `
  <p style="${S.heading}">${safeName}, you're invited</p>
  <p style="${S.body}">You've been selected for early access to TwinMe &mdash; an AI twin that actually knows you. We're starting small, just a handful of people, so we can get this right.</p>

  <div style="${S.codeCard}">
    <p style="${S.codeLabel}">Your invite code</p>
    <p style="${S.codeValue}">${safeCode}</p>
  </div>

  <p style="${S.body}">Click below to get started. Your code will be applied automatically.</p>

  <div style="margin-top:28px;">
    <a href="${inviteUrl}" style="${S.cta}">Start your twin journey</a>
  </div>

  <div style="${S.footer}">
    <p style="margin:0 0 4px;">This invite is personal &mdash; it can only be used once.</p>
    <p style="margin:0;color:#2A2624;">TwinMe &mdash; discover what makes you, you.</p>
  </div>`;

  return resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${safeName}, you're invited to TwinMe`,
    html: emailShell(body),
  });
}
