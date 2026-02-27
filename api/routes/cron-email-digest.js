// api/routes/cron-email-digest.js
import express from 'express';
import { supabaseAdmin } from '../services/database.js';
import { sendWeeklyDigest } from '../services/emailService.js';

const router = express.Router();

router.post('/', async (req, res) => {
  if (req.headers['authorization']?.replace('Bearer ', '') !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: subs } = await supabaseAdmin
    .from('user_subscriptions').select('user_id, plan').in('plan', ['pro', 'max']).eq('status', 'active');

  if (!subs?.length) return res.json({ sent: 0 });

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let sent = 0;

  for (const sub of subs) {
    try {
      const [{ data: user }, { data: memories }] = await Promise.all([
        supabaseAdmin.from('users').select('email, first_name').eq('id', sub.user_id).single(),
        supabaseAdmin.from('user_memories').select('content, memory_type, importance_score')
          .eq('user_id', sub.user_id).gte('created_at', weekAgo)
          .order('importance_score', { ascending: false }).limit(15),
      ]);

      if (!user?.email || !memories?.length) continue;

      const topInsight = memories.find(m => m.memory_type === 'reflection') || memories[0];
      const platformCount = memories.filter(m => m.memory_type === 'platform_data').length;

      await sendWeeklyDigest({
        toEmail: user.email,
        firstName: user.first_name || 'there',
        insight: topInsight.content.slice(0, 280),
        moodSummary: platformCount > 0
          ? `${platformCount} new observations from your platforms this week.`
          : 'A quieter week — your twin is watching for patterns.',
        twinQuestion: "What's been on your mind that you haven't said out loud?",
        richnessDelta: memories.length,
      });
      sent++;
    } catch (err) {
      console.error(`[DigestCron] Failed for ${sub.user_id}:`, err.message);
    }
  }

  res.json({ sent });
});

export default router;
