// api/routes/email-unsubscribe.js
// One-click email opt-out. GET /api/email/unsubscribe?uid=<userId>&token=<hmac>
import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { verifyUnsubscribeToken } from '../services/emailService.js';
import { createLogger } from '../services/logger.js';

const log = createLogger('EmailUnsubscribe');

const router = express.Router();
const APP_URL = process.env.VITE_APP_URL || 'https://twin-ai-learn.vercel.app';

router.get('/unsubscribe', async (req, res) => {
  const { uid, token } = req.query;

  if (!uid || !token || !verifyUnsubscribeToken(uid, token)) {
    return res.status(400).send(page('Invalid or expired unsubscribe link.', false));
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update({ email_digest_unsubscribed: true })
    .eq('id', uid);

  if (error) {
    log.error('DB error:', error.message);
    return res.status(500).send(page('Something went wrong. Please try again.', false));
  }

  return res.send(page('You\'ve been unsubscribed from weekly emails.', true));
});

function page(message, success) {
  const color = success ? '#10B981' : '#ef4444';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>TwinMe — Unsubscribe</title>
<style>body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{text-align:center;max-width:420px;padding:40px}</style></head>
<body><div class="box">
<p style="font-size:32px;margin-bottom:16px">${success ? '✓' : '✗'}</p>
<p style="font-size:18px;font-weight:600;color:${color}">${message}</p>
${success ? `<p style="color:#6b7280;margin-top:16px">You won't receive weekly digest emails anymore.<br>You can re-enable them in <a href="${APP_URL}/settings" style="color:#818cf8">Settings</a>.</p>` : ''}
</div></body></html>`;
}

export default router;
