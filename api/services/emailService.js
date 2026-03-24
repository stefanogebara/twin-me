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
// Shared email shell — black/white, Instrument Serif + Inter, matching hero page
// ============================================================================

function emailShell(bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  body {
    margin: 0; padding: 0;
    background-color: #0C0C0C;
    color: #F5F5F4;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .container {
    max-width: 560px;
    margin: 0 auto;
    padding: 48px 28px 40px;
  }
  .logo-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 40px;
  }
  .logo-icon {
    width: 28px; height: 28px;
    border-radius: 50%;
    object-fit: cover;
  }
  .logo-text {
    font-family: 'Instrument Serif', Georgia, serif;
    font-size: 22px;
    letter-spacing: -0.5px;
    color: #F5F5F4;
  }
  .heading {
    font-family: 'Instrument Serif', Georgia, serif;
    font-style: italic;
    font-size: 28px;
    letter-spacing: -0.5px;
    color: #F5F5F4;
    margin: 0 0 8px;
    line-height: 1.3;
  }
  .subheading {
    font-family: 'Instrument Serif', Georgia, serif;
    font-style: italic;
    font-size: 20px;
    letter-spacing: -0.3px;
    color: #F5F5F4;
    margin: 32px 0 16px;
    line-height: 1.3;
  }
  .body-text {
    font-size: 15px;
    line-height: 1.7;
    color: rgba(245, 245, 244, 0.6);
    margin: 0 0 16px;
  }
  .card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 20px 24px;
    margin-bottom: 12px;
  }
  .card p {
    font-size: 15px;
    line-height: 1.65;
    color: rgba(245, 245, 244, 0.75);
    margin: 0;
  }
  .section-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(245, 245, 244, 0.3);
    margin-bottom: 14px;
  }
  .code-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 16px;
    padding: 28px;
    margin: 24px 0;
    text-align: center;
  }
  .code-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(245, 245, 244, 0.3);
  }
  .code-value {
    font-family: 'Inter', monospace;
    font-size: 32px;
    font-weight: 700;
    letter-spacing: 6px;
    color: #F5F5F4;
    margin: 14px 0 0;
  }
  .cta {
    display: inline-block;
    background: #F5F5F4;
    color: #0C0C0C;
    text-decoration: none;
    padding: 14px 36px;
    border-radius: 100px;
    font-weight: 600;
    font-size: 15px;
    font-family: 'Inter', sans-serif;
    margin-top: 28px;
  }
  .divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 36px 0;
    border: none;
  }
  .footer {
    margin-top: 40px;
    font-size: 12px;
    color: rgba(245, 245, 244, 0.25);
    line-height: 1.7;
  }
  .footer a {
    color: rgba(245, 245, 244, 0.25);
    text-decoration: underline;
  }
  .list-item {
    font-size: 14px;
    line-height: 1.8;
    color: rgba(245, 245, 244, 0.55);
    margin-bottom: 4px;
  }
  .list-item strong {
    color: #F5F5F4;
    font-weight: 500;
  }
</style>
</head>
<body>
<div class="container">
  <div class="logo-row">
    <img src="${LOGO_URL}" alt="" class="logo-icon" />
    <span class="logo-text">TwinMe</span>
  </div>
  ${bodyContent}
</div>
</body>
</html>`;
}


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
 */
export async function sendWeeklyDigest({ toEmail, firstName, reflections, newMemories, userId }) {
  if (!resend) throw new Error('Email service not configured');

  const unsubToken = generateUnsubscribeToken(userId);
  const unsubUrl = `${APP_URL}/api/email/unsubscribe?uid=${userId}&token=${unsubToken}`;
  const safeName = escapeHtml(firstName);

  const reflectionCards = reflections
    .slice(0, 3)
    .map(text => `<div class="card"><p>${escapeHtml(text.slice(0, 300))}</p></div>`)
    .join('');

  const body = `
  <p class="heading">Your twin noticed something, ${safeName}</p>
  <p class="body-text">Here's what stood out this week.</p>

  <hr class="divider" />

  <div class="section-label">This week's reflections</div>
  ${reflectionCards}
  ${newMemories > 0 ? `<p style="font-size:13px;color:rgba(245,245,244,0.3);margin-top:8px">+${newMemories} new memories this week</p>` : ''}

  <a href="${APP_URL}/talk-to-twin" class="cta">Talk to your twin</a>

  <div class="footer">
    <p>You're receiving this because you use TwinMe.</p>
    <p><a href="${unsubUrl}">Unsubscribe from weekly emails</a></p>
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
  <p class="heading">Welcome, ${safeName}</p>
  <p class="body-text">You're one of the first people to try TwinMe. Your digital twin is now live and learning about you.</p>

  <hr class="divider" />

  <p class="subheading">Get the most out of it</p>

  <p class="list-item"><strong>Connect platforms</strong> &mdash; Spotify, YouTube, Gmail give your twin real context</p>
  <p class="list-item"><strong>Chat with your twin</strong> &mdash; the more you talk, the better it knows you</p>
  <p class="list-item"><strong>Give feedback</strong> &mdash; use the feedback button anytime</p>

  <a href="${APP_URL}/dashboard" class="cta">Open your dashboard</a>

  <div class="footer">
    <p>You're part of a small group shaping what TwinMe becomes. We read every piece of feedback.</p>
    <p style="color:rgba(245,245,244,0.15)">TwinMe &mdash; discover what makes you, you.</p>
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
  <p class="heading">${safeName}, you're invited</p>
  <p class="body-text">You've been selected for early access to TwinMe &mdash; an AI twin that actually knows you. We're starting small, just a handful of people, so we can get this right.</p>

  <div class="code-card">
    <div class="code-label">Your invite code</div>
    <div class="code-value">${safeCode}</div>
  </div>

  <p class="body-text">Click below to get started. Your code will be applied automatically.</p>

  <a href="${inviteUrl}" class="cta">Start your twin journey</a>

  <div class="footer">
    <p>This invite is personal &mdash; it can only be used once.</p>
    <p style="color:rgba(245,245,244,0.15)">TwinMe &mdash; discover what makes you, you.</p>
  </div>`;

  return resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${safeName}, you're invited to TwinMe`,
    html: emailShell(body),
  });
}
