// api/routes/cron-email-digest.js
// Weekly digest — sends to all users with recent activity (not gated by subscription tier).
import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { sendWeeklyDigest } from '../services/emailService.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const cronSecret = req.headers['authorization']?.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Find users who have had memory activity in the last week
  const { data: activeUsers } = await supabaseAdmin
    .from('user_memories')
    .select('user_id')
    .gte('created_at', weekAgo)
    .limit(500);

  if (!activeUsers?.length) return res.json({ sent: 0 });

  // Dedupe user IDs
  const userIds = [...new Set(activeUsers.map(r => r.user_id))];

  let sent = 0;
  let skipped = 0;

  for (const userId of userIds) {
    try {
      // Fetch user — skip if opted out or no email
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('email, first_name, email_digest_unsubscribed')
        .eq('id', userId)
        .single();

      if (!user?.email || user.email_digest_unsubscribed) {
        skipped++;
        continue;
      }

      // Fetch top 3 reflections from the last week
      const { data: reflections } = await supabaseAdmin
        .from('user_memories')
        .select('content')
        .eq('user_id', userId)
        .eq('memory_type', 'reflection')
        .gte('created_at', weekAgo)
        .order('importance_score', { ascending: false })
        .limit(3);

      if (!reflections?.length) {
        // Try all-time top reflections if no recent ones
        const { data: fallback } = await supabaseAdmin
          .from('user_memories')
          .select('content')
          .eq('user_id', userId)
          .eq('memory_type', 'reflection')
          .order('importance_score', { ascending: false })
          .limit(3);

        if (!fallback?.length) { skipped++; continue; }
        reflections.push(...fallback);
      }

      // Count total new memories this week
      const { count: newMemories } = await supabaseAdmin
        .from('user_memories')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', weekAgo);

      await sendWeeklyDigest({
        toEmail: user.email,
        firstName: user.first_name || 'there',
        reflections: reflections.map(r => r.content),
        newMemories: newMemories || 0,
        userId,
      });

      sent++;
    } catch (err) {
      console.error(`[DigestCron] Failed for ${userId}:`, err.message);
    }
  }

  console.log(`[DigestCron] Sent: ${sent}, Skipped: ${skipped}`);
  res.json({ sent, skipped });
});

export default router;
