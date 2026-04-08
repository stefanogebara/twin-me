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

/**
 * Platform nudge email for beta users who signed up but haven't connected platforms or chatted.
 */
export async function sendPlatformNudge({ toEmail, firstName, userId }) {
  if (!resend) { log.warn('Skipping platform nudge email (Resend not configured)'); return; }

  const safeName = escapeHtml(firstName || 'there');
  const unsubToken = generateUnsubscribeToken(userId);
  const unsubUrl = `${APP_URL}/api/email/unsubscribe?uid=${userId}&token=${unsubToken}`;
  const dashboardUrl = `${APP_URL}/dashboard`;

  const body = `
  <p style="${S.heading}">Your twin is waiting for you, ${safeName}</p>
  <p style="${S.body}">You started your twin journey &mdash; but it's still learning the basics. The more data your twin has, the more it sounds like you. Right now, it's a blank canvas.</p>

  <div style="${S.divider}"></div>

  <p style="${S.subheading}">Three quick wins</p>

  <div style="${S.card}">
    <p style="${S.cardText}"><span style="${S.listStrong}">1. Connect Spotify</span> <span style="color:#57534E;">&mdash; 2 clicks</span></p>
    <p style="font-family:'Inter',Arial,sans-serif;font-size:13px;color:#57534E;margin:6px 0 0;">Your music taste reveals more about you than you'd think.</p>
  </div>

  <div style="${S.card}">
    <p style="${S.cardText}"><span style="${S.listStrong}">2. Connect YouTube</span> <span style="color:#57534E;">&mdash; 2 clicks</span></p>
    <p style="font-family:'Inter',Arial,sans-serif;font-size:13px;color:#57534E;margin:6px 0 0;">What you watch tells your twin what you care about.</p>
  </div>

  <div style="${S.card}">
    <p style="${S.cardText}"><span style="${S.listStrong}">3. Chat with your twin</span></p>
    <p style="font-family:'Inter',Arial,sans-serif;font-size:13px;color:#57534E;margin:6px 0 0;">Every conversation makes your twin sharper and more you.</p>
  </div>

  <div style="margin-top:28px;">
    <a href="${dashboardUrl}" style="${S.cta}">Connect your platforms</a>
  </div>

  <div style="${S.footer}">
    <p style="margin:0 0 4px;">You're receiving this because you signed up for TwinMe.</p>
    <p style="margin:0;"><a href="${unsubUrl}" style="${S.footerLink}">Unsubscribe from emails</a></p>
  </div>`;

  try {
    await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `Your twin is waiting for you, ${safeName}`,
      html: emailShell(body),
    });
    log.info('Platform nudge email sent', { email: toEmail, userId });
  } catch (err) {
    log.error('Platform nudge email failed', { error: err.message, email: toEmail });
    throw err;
  }
}

/**
 * Proactive insight notification email — batched insights from the twin.
 *
 * @param {object} params
 * @param {string} params.toEmail
 * @param {string} params.firstName
 * @param {string} params.userId
 * @param {Array<{insight: string, category: string, urgency: string}>} params.insights
 */
export async function sendInsightNotification({ toEmail, firstName, userId, insights }) {
  if (!resend) { log.warn('Skipping insight notification email (Resend not configured)'); return; }
  if (!insights?.length) return;

  const safeName = escapeHtml(firstName || 'there');
  const unsubToken = generateUnsubscribeToken(userId);
  const unsubUrl = `${APP_URL}/api/email/unsubscribe?uid=${userId}&token=${unsubToken}`;

  const categoryLabels = {
    nudge: 'Nudge', trend: 'Trend', concern: 'Alert', celebration: 'Win',
    goal_progress: 'Goal', pattern: 'Pattern', suggestion: 'Idea',
    anomaly: 'Alert', briefing: 'Briefing', reminder: 'Reminder',
    default: 'Insight',
  };

  const insightCards = insights.slice(0, 3).map(i => {
    const label = categoryLabels[i.category] || categoryLabels.default;
    return `
      <div style="${S.card}">
        <p style="${S.cardText}">
          <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#A8A29E;margin-right:8px;">${label}</span>
          ${escapeHtml((i.insight || '').slice(0, 300))}
        </p>
      </div>`;
  }).join('');

  const subjectLine = insights.length === 1
    ? `Your twin noticed: ${(insights[0].insight || '').substring(0, 50)}...`
    : `Your twin has ${insights.length} things to share`;

  const body = `
  <p style="${S.heading}">Hey ${safeName}, your twin noticed something</p>
  <p style="${S.body}">
    ${insights.length === 1 ? "Here's what caught my attention:" : `Here are ${insights.length} things I noticed:`}
  </p>

  <div style="${S.divider}"></div>

  ${insightCards}

  <div style="margin-top:28px;">
    <a href="${APP_URL}/talk-to-twin" style="${S.cta}">Talk to your twin &rarr;</a>
  </div>

  <div style="${S.footer}">
    <p style="margin:0 0 4px;">Your twin sends these when it notices something worth sharing.</p>
    <p style="margin:0;"><a href="${unsubUrl}" style="${S.footerLink}">Unsubscribe from notifications</a></p>
  </div>`;

  try {
    await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: subjectLine,
      html: emailShell(body),
    });
    log.info('Insight notification email sent', { email: toEmail, userId, count: insights.length });
  } catch (err) {
    log.error('Insight notification email failed', { error: err.message, email: toEmail });
    throw err;
  }
}

/**
 * Morning briefing email — personalized daily update from the twin.
 *
 * @param {object} params
 * @param {string} params.toEmail
 * @param {string} params.firstName
 * @param {string} params.userId
 * @param {object} params.briefing - { greeting, highlight, stats, cta, isGettingStarted }
 */
export async function sendMorningBriefing({ toEmail, firstName, userId, briefing }) {
  if (!resend) { log.warn('Skipping morning briefing email (Resend not configured)'); return; }

  const safeName = escapeHtml(firstName || 'there');
  const safeGreeting = escapeHtml(briefing.greeting);
  const safeHighlight = escapeHtml(briefing.highlight);
  const safeCta = escapeHtml(briefing.cta);

  const unsubToken = generateUnsubscribeToken(userId);
  const unsubUrl = `${APP_URL}/api/email/unsubscribe?uid=${userId}&token=${unsubToken}`;

  const ctaUrl = briefing.isGettingStarted
    ? `${APP_URL}/dashboard`
    : `${APP_URL}/talk-to-twin`;

  // Stats row: "47 memories | 1 platform | 3 insights ready"
  const statsText = [
    `${briefing.stats.memoriesLearned} memories`,
    `${briefing.stats.platformsConnected} platform${briefing.stats.platformsConnected !== 1 ? 's' : ''}`,
    `${briefing.stats.insightsReady} insight${briefing.stats.insightsReady !== 1 ? 's' : ''} ready`,
  ].join(' &nbsp;&bull;&nbsp; ');

  // Calendar events section (Dimension-style meeting prep)
  const eventsHtml = (briefing.todayEvents?.length > 0)
    ? `<div style="margin:20px 0 0;">
        <p style="font-family:'Inter',Arial,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:#78716C;margin:0 0 12px;">Today's Schedule</p>
        ${briefing.todayEvents.map(e => {
          const safeTitle = escapeHtml(e.title);
          const safeTime = escapeHtml(e.time);
          const attendeeText = e.attendees?.length > 0 ? ` &middot; ${escapeHtml(e.attendees.join(', '))}` : '';
          return `<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-family:'Inter',Arial,sans-serif;font-size:13px;color:#F5F5F4;font-weight:500;">${safeTime}</span>
            <span style="font-family:'Inter',Arial,sans-serif;font-size:13px;color:#A8A29E;"> ${safeTitle}${attendeeText}</span>
          </div>`;
        }).join('')}
      </div>`
    : '';

  const body = `
  <p style="${S.heading}">${safeGreeting}</p>

  <div style="${S.divider}"></div>

  <div style="${S.card}">
    <p style="${S.cardText}">${safeHighlight}</p>
  </div>

  ${eventsHtml}

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 28px;">
  <tr>
    <td style="font-family:'Inter',Arial,Helvetica,sans-serif;font-size:13px;color:#57534E;line-height:1.6;">
      ${statsText}
    </td>
  </tr>
  </table>

  <div style="margin-top:28px;">
    <a href="${ctaUrl}" style="${S.cta}">${safeCta}</a>
  </div>

  <div style="${S.footer}">
    <p style="margin:0 0 4px;">Your twin sends this every morning to keep you in the loop.</p>
    <p style="margin:0;"><a href="${unsubUrl}" style="${S.footerLink}">Unsubscribe from morning briefings</a></p>
  </div>`;

  try {
    await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `${safeGreeting}`,
      html: emailShell(body),
    });
    log.info('Morning briefing email sent', { email: toEmail, userId });
  } catch (err) {
    log.error('Morning briefing email failed', { error: err.message, email: toEmail });
    throw err;
  }
}
