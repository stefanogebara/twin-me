/**
 * Twin Eval Rubric API
 * ====================
 * Internal tool for scoring twin accuracy against 10 standard questions.
 *
 * POST /api/eval/run      - Create a new eval run (fires 10 twin chat calls)
 * POST /api/eval/score    - Save scores for a run
 * GET  /api/eval/history  - Historical runs with score trends
 * GET  /api/eval/flags    - Get feature flags for a user
 * POST /api/eval/flags    - Set a feature flag for a user
 */

import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/database.js';
import { getFeatureFlags, setFeatureFlag, getAllFlagsForUser } from '../services/featureFlagsService.js';

const router = express.Router();

// The 10 canonical eval questions
const EVAL_QUESTIONS = [
  { id: 1, type: 'factual',    question: 'What is my job or professional role?' },
  { id: 2, type: 'factual',    question: 'What city or country do I live in?' },
  { id: 3, type: 'preference', question: 'What music genre or artists do I listen to most?' },
  { id: 4, type: 'preference', question: 'What do I do for exercise or physical activity?' },
  { id: 5, type: 'behavioral', question: 'Am I more of a morning or night person?' },
  { id: 6, type: 'behavioral', question: 'Do I tend to have busier weekdays or busier weekends?' },
  { id: 7, type: 'value',      question: 'How would you describe my relationship to productivity and work?' },
  { id: 8, type: 'value',      question: 'What topics or subjects am I most curious about?' },
  { id: 9, type: 'prediction', question: 'What would I most likely do on a free Saturday afternoon?' },
  { id: 10, type: 'prediction', question: 'What kind of content or recommendations would I share with a friend?' },
];

/**
 * POST /api/eval/run
 * Stores pre-collected twin responses (collected by the frontend) into the DB.
 * Body: { questions: [{id, type, question, twinResponse, scores}], target_user_id?: UUID }
 */
router.post('/run', authenticateUser, async (req, res) => {
  try {
    const evaluatorId = req.user.id;
    const targetUserId = req.body.target_user_id || evaluatorId;
    const { questions } = req.body;

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'questions array required' });
    }

    // Normalize: ensure each question has a scores object with null dimensions
    const results = questions.map(q => ({
      id: q.id,
      type: q.type,
      question: q.question,
      twinResponse: q.twinResponse || '[no response]',
      scores: q.scores || { accuracy: null, specificity: null, voice: null },
    }));

    const { data: run, error: insertErr } = await supabaseAdmin
      .from('eval_runs')
      .insert({
        user_id: targetUserId,
        evaluator_id: evaluatorId,
        questions: results,
        total_score: null,
      })
      .select()
      .single();

    if (insertErr) throw new Error(insertErr.message);

    res.json({ run });
  } catch (err) {
    console.error('[eval] run error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/eval/score
 * Save evaluator scores for a completed run.
 * Body: { run_id: UUID, scores: [{ questionId, accuracy, specificity, voice }], notes?: string }
 */
router.post('/score', authenticateUser, async (req, res) => {
  try {
    const { run_id, scores, notes } = req.body;

    if (!run_id || !Array.isArray(scores)) {
      return res.status(400).json({ error: 'run_id and scores array required' });
    }

    // Fetch current run
    const { data: run, error: fetchErr } = await supabaseAdmin
      .from('eval_runs')
      .select('*')
      .eq('id', run_id)
      .eq('evaluator_id', req.user.id)
      .single();

    if (fetchErr || !run) return res.status(404).json({ error: 'Run not found' });

    // Merge scores into questions
    const scoreMap = {};
    for (const s of scores) {
      scoreMap[s.questionId] = { accuracy: s.accuracy, specificity: s.specificity, voice: s.voice };
    }

    const updatedQuestions = run.questions.map(q => ({
      ...q,
      scores: scoreMap[q.id] || q.scores,
    }));

    // Compute total score: sum of all non-null scores / max possible (10 questions × 3 dims × 5 max)
    const maxPossible = EVAL_QUESTIONS.length * 3 * 5;
    let scoreSum = 0;
    let scoredCount = 0;
    for (const q of updatedQuestions) {
      for (const dim of ['accuracy', 'specificity', 'voice']) {
        if (q.scores[dim] != null) {
          scoreSum += q.scores[dim];
          scoredCount++;
        }
      }
    }
    const total_score = scoredCount > 0 ? parseFloat(((scoreSum / maxPossible) * 100).toFixed(1)) : null;

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('eval_runs')
      .update({ questions: updatedQuestions, total_score, notes: notes || run.notes })
      .eq('id', run_id)
      .select()
      .single();

    if (updateErr) throw new Error(updateErr.message);

    res.json({ run: updated });
  } catch (err) {
    console.error('[eval] score error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/eval/history
 * Returns past eval runs for a user with score trend.
 * Query: ?user_id=UUID (defaults to self)
 */
router.get('/history', authenticateUser, async (req, res) => {
  try {
    const userId = req.query.user_id || req.user.id;

    const { data, error } = await supabaseAdmin
      .from('eval_runs')
      .select('id, user_id, evaluator_id, run_at, total_score, notes')
      .eq('user_id', userId)
      .order('run_at', { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);

    // Compute trend: compare last two runs
    let trend = null;
    if (data && data.length >= 2) {
      const latest = data[0].total_score;
      const prev = data[1].total_score;
      if (latest != null && prev != null) {
        trend = parseFloat((latest - prev).toFixed(1));
      }
    }

    res.json({ runs: data || [], trend });
  } catch (err) {
    console.error('[eval] history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/eval/run/:id
 * Returns full run details including question responses and scores.
 */
router.get('/run/:id', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('eval_runs')
      .select('*')
      .eq('id', req.params.id)
      .eq('evaluator_id', req.user.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Run not found' });
    res.json({ run: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/eval/flags?user_id=UUID
 * Returns feature flags for a user.
 */
router.get('/flags', authenticateUser, async (req, res) => {
  try {
    const userId = req.query.user_id || req.user.id;
    const flags = await getAllFlagsForUser(userId);

    // Merge with defaults (known flags that aren't in DB yet default to true)
    const KNOWN_FLAGS = ['expert_routing', 'identity_context', 'emotional_state', 'ebbinghaus_decay'];
    const flagMap = {};
    for (const f of flags) flagMap[f.flag_name] = f;

    const result = KNOWN_FLAGS.map(name => ({
      flag_name: name,
      enabled: flagMap[name]?.enabled ?? true,
      updated_at: flagMap[name]?.updated_at || null,
    }));

    res.json({ flags: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/eval/flags
 * Set a feature flag.
 * Body: { user_id?: UUID, flag_name: string, enabled: boolean }
 */
router.post('/flags', authenticateUser, async (req, res) => {
  try {
    const { flag_name, enabled, user_id } = req.body;
    const targetUserId = user_id || req.user.id;

    const KNOWN_FLAGS = ['expert_routing', 'identity_context', 'emotional_state', 'ebbinghaus_decay'];
    if (!KNOWN_FLAGS.includes(flag_name)) {
      return res.status(400).json({ error: `Unknown flag: ${flag_name}. Valid: ${KNOWN_FLAGS.join(', ')}` });
    }

    await setFeatureFlag(targetUserId, flag_name, Boolean(enabled));
    res.json({ success: true, flag_name, enabled: Boolean(enabled) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
