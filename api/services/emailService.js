// api/services/emailService.js
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
if (!resend) console.warn('[EmailService] RESEND_API_KEY not set — email sending disabled');
const FROM = process.env.RESEND_FROM_EMAIL || 'twin@twinme.me';
const APP_URL = process.env.VITE_APP_URL || 'https://twin-ai-learn.vercel.app';

export async function sendWeeklyDigest({ toEmail, firstName, insight, moodSummary, twinQuestion, richnessDelta }) {
  return resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `Your twin noticed something this week, ${firstName}`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:0}
.c{max-width:600px;margin:0 auto;padding:40px 24px}
.logo{font-size:20px;font-weight:700;color:#818cf8;margin-bottom:32px}
.card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;padding:24px;margin-bottom:16px}
.lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;margin-bottom:8px}
.cta{display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;margin-top:24px}
.footer{margin-top:40px;font-size:12px;color:#4b5563}
</style></head><body><div class="c">
<div class="logo">TwinMe</div>
<p style="color:#9ca3af;margin-bottom:24px">Hey ${firstName} — here's what your twin noticed this week.</p>
<div class="card"><div class="lbl">This week's insight</div><p style="font-size:17px;line-height:1.6">${insight}</p></div>
<div class="card"><div class="lbl">Your mood pattern</div><p style="color:#d1d5db">${moodSummary}</p></div>
<div class="card"><div class="lbl">A question from your twin</div><p style="color:#818cf8;font-style:italic">"${twinQuestion}"</p></div>
${richnessDelta > 0 ? `<p style="color:#6b7280;font-size:13px">+${richnessDelta} new memories this week.</p>` : ''}
<a href="${APP_URL}/chat" class="cta">Talk to your twin</a>
<div class="footer"><p>You're on Pro or Max — <a href="${APP_URL}/settings" style="color:#4b5563">manage preferences</a></p></div>
</div></body></html>`,
  });
}
