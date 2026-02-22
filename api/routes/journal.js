import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { complete, TIER_ANALYSIS } from '../services/llmGateway.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper: wrap async route handlers
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// All journal routes require authentication
router.use(authenticateUser);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================================
// GET /entries - List user's journal entries (paginated, newest first)
// ============================================================================
router.get('/entries', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const offset = (page - 1) * limit;

  // Get entries with their analyses
  const { data: entries, error, count } = await supabase
    .from('journal_entries')
    .select(`
      *,
      journal_analyses (
        id, themes, emotions, personality_signals, self_perception, summary, created_at
      )
    `, { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[Journal] Error fetching entries:', error);
    return res.status(500).json({ error: 'Failed to fetch journal entries' });
  }

  res.json({
    entries: entries || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit)
    }
  });
}));

// ============================================================================
// POST /entries - Create a new journal entry
// ============================================================================
router.post('/entries', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { title, content, mood, energy_level, tags } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Content is required' });
  }

  if (content.length > 10000) {
    return res.status(400).json({ error: 'Content must be under 10,000 characters' });
  }

  const validMoods = ['happy', 'calm', 'anxious', 'sad', 'energized', 'reflective', 'grateful', 'frustrated'];
  if (mood && !validMoods.includes(mood)) {
    return res.status(400).json({ error: `Invalid mood. Must be one of: ${validMoods.join(', ')}` });
  }

  if (energy_level !== undefined && (energy_level < 1 || energy_level > 5)) {
    return res.status(400).json({ error: 'Energy level must be between 1 and 5' });
  }

  const { data: entry, error } = await supabase
    .from('journal_entries')
    .insert({
      user_id: userId,
      title: title?.trim() || null,
      content: content.trim(),
      mood: mood || null,
      energy_level: energy_level || null,
      tags: Array.isArray(tags) ? tags : []
    })
    .select()
    .single();

  if (error) {
    console.error('[Journal] Error creating entry:', error);
    return res.status(500).json({ error: 'Failed to create journal entry' });
  }

  res.status(201).json({ entry });
}));

// ============================================================================
// PUT /entries/:id - Update a journal entry
// ============================================================================
router.put('/entries/:id', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: 'Invalid entry ID' });
  }

  const { title, content, mood, energy_level, tags } = req.body;

  if (content !== undefined && content.trim().length === 0) {
    return res.status(400).json({ error: 'Content cannot be empty' });
  }

  if (content && content.length > 10000) {
    return res.status(400).json({ error: 'Content must be under 10,000 characters' });
  }

  const validMoods = ['happy', 'calm', 'anxious', 'sad', 'energized', 'reflective', 'grateful', 'frustrated'];
  if (mood && !validMoods.includes(mood)) {
    return res.status(400).json({ error: `Invalid mood. Must be one of: ${validMoods.join(', ')}` });
  }

  // Build update object with only provided fields
  const updates = {};
  if (title !== undefined) updates.title = title?.trim() || null;
  if (content !== undefined) updates.content = content.trim();
  if (mood !== undefined) updates.mood = mood;
  if (energy_level !== undefined) updates.energy_level = energy_level;
  if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : [];

  const { data: entry, error } = await supabase
    .from('journal_entries')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('[Journal] Error updating entry:', error);
    return res.status(500).json({ error: 'Failed to update journal entry' });
  }

  if (!entry) {
    return res.status(404).json({ error: 'Journal entry not found' });
  }

  res.json({ entry });
}));

// ============================================================================
// DELETE /entries/:id - Delete a journal entry
// ============================================================================
router.delete('/entries/:id', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: 'Invalid entry ID' });
  }

  const { error } = await supabase
    .from('journal_entries')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.error('[Journal] Error deleting entry:', error);
    return res.status(500).json({ error: 'Failed to delete journal entry' });
  }

  res.json({ success: true, message: 'Entry deleted' });
}));

// ============================================================================
// POST /entries/:id/analyze - Trigger AI analysis for a journal entry
// ============================================================================
router.post('/entries/:id/analyze', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: 'Invalid entry ID' });
  }

  // Fetch the entry
  const { data: entry, error: fetchError } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError || !entry) {
    return res.status(404).json({ error: 'Journal entry not found' });
  }

  // Call LLM Gateway for analysis
  const contextParts = [];
  if (entry.mood) contextParts.push(`User-reported mood: ${entry.mood}`);
  if (entry.energy_level) contextParts.push(`Self-reported energy level: ${entry.energy_level}/5`);
  if (entry.tags?.length > 0) contextParts.push(`Tags: ${entry.tags.join(', ')}`);

  const llmResult = await complete({
    tier: TIER_ANALYSIS,
    system: `You are an expert personality psychologist analyzing a personal journal entry to understand who this person is at their core. Focus on what their words reveal about their personality, values, and self-perception. Be warm and insightful, not clinical.`,
    messages: [
      {
        role: 'user',
        content: `Analyze this journal entry for personality traits, emotional patterns, and self-perception signals.
${contextParts.length > 0 ? '\nContext: ' + contextParts.join('. ') : ''}

Journal entry:
"""
${entry.content}
"""

Return a JSON object with exactly this structure (no markdown, just raw JSON):
{
  "themes": ["theme1", "theme2", "theme3"],
  "emotions": [
    { "emotion": "name", "intensity": 0.0 }
  ],
  "personality_signals": [
    { "trait": "Big Five trait name", "direction": "high" or "low", "evidence": "brief quote or observation" }
  ],
  "self_perception": {
    "how_they_see_themselves": "one sentence",
    "values_expressed": ["value1", "value2"]
  },
  "summary": "One warm, insightful sentence summarizing what this entry reveals about the person"
}`
      }
    ],
    maxTokens: 1024,
    serviceName: 'journalAnalysis'
  });

  let analysis;
  try {
    const responseText = llmResult.content.trim();
    // Strip markdown code fences if present
    const jsonStr = responseText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    analysis = JSON.parse(jsonStr);
  } catch (parseError) {
    console.error('[Journal] Failed to parse AI response:', parseError);
    return res.status(500).json({ error: 'Failed to parse AI analysis' });
  }

  // Store the analysis
  const { data: savedAnalysis, error: saveError } = await supabase
    .from('journal_analyses')
    .insert({
      user_id: userId,
      entry_id: id,
      themes: analysis.themes || [],
      emotions: analysis.emotions || [],
      personality_signals: analysis.personality_signals || [],
      self_perception: analysis.self_perception || {},
      summary: analysis.summary || ''
    })
    .select()
    .single();

  if (saveError) {
    console.error('[Journal] Error saving analysis:', saveError);
    return res.status(500).json({ error: 'Failed to save analysis' });
  }

  // Mark entry as analyzed
  const { error: analyzedErr } = await supabase
    .from('journal_entries')
    .update({ is_analyzed: true })
    .eq('id', id);
  if (analyzedErr) console.error('[Journal] Error marking entry as analyzed:', analyzedErr.message);

  // =========================================================================
  // INTEGRATION: Push journal insights to Twins Brain, Mem0, and Soul Signature
  // Fire-and-forget so we don't block the response
  // =========================================================================
  pushJournalToIntegrations(userId, entry, savedAnalysis).catch(err => {
    console.warn('[Journal] Integration push failed (non-blocking):', err.message);
  });

  res.json({ analysis: savedAnalysis });
}));

// ============================================================================
// GET /insights - Get aggregated journal insights
// ============================================================================
router.get('/insights', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Get recent analyses (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: analyses, error } = await supabase
    .from('journal_analyses')
    .select('themes, emotions, personality_signals, self_perception, summary, created_at')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[Journal] Error fetching insights:', error);
    return res.status(500).json({ error: 'Failed to fetch insights' });
  }

  // Get entry count and mood distribution
  const { data: entries, error: entriesError } = await supabase
    .from('journal_entries')
    .select('mood, energy_level, created_at')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  if (entriesError) {
    console.error('[Journal] Error fetching entry stats:', entriesError);
  }

  // Aggregate themes
  const themeCount = {};
  const emotionMap = {};
  const personalitySignals = [];
  const values = new Set();

  (analyses || []).forEach(a => {
    (a.themes || []).forEach(t => {
      themeCount[t] = (themeCount[t] || 0) + 1;
    });
    (a.emotions || []).forEach(e => {
      if (!emotionMap[e.emotion]) emotionMap[e.emotion] = [];
      emotionMap[e.emotion].push(e.intensity);
    });
    (a.personality_signals || []).forEach(s => {
      personalitySignals.push(s);
    });
    if (a.self_perception?.values_expressed) {
      a.self_perception.values_expressed.forEach(v => values.add(v));
    }
  });

  // Top themes
  const topThemes = Object.entries(themeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([theme, count]) => ({ theme, count }));

  // Average emotions
  const avgEmotions = Object.entries(emotionMap)
    .map(([emotion, intensities]) => ({
      emotion,
      avgIntensity: Number((intensities.reduce((a, b) => a + b, 0) / intensities.length).toFixed(2)),
      occurrences: intensities.length
    }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 6);

  // Mood distribution
  const moodDistribution = {};
  (entries || []).forEach(e => {
    if (e.mood) moodDistribution[e.mood] = (moodDistribution[e.mood] || 0) + 1;
  });

  // Average energy
  const energyValues = (entries || []).filter(e => e.energy_level).map(e => e.energy_level);
  const avgEnergy = energyValues.length > 0
    ? Number((energyValues.reduce((a, b) => a + b, 0) / energyValues.length).toFixed(1))
    : null;

  res.json({
    insights: {
      totalEntries: (entries || []).length,
      analyzedEntries: (analyses || []).length,
      topThemes,
      avgEmotions,
      moodDistribution,
      avgEnergy,
      valuesExpressed: Array.from(values).slice(0, 10),
      personalitySignals: personalitySignals.slice(0, 10),
      recentSummaries: (analyses || []).slice(0, 3).map(a => a.summary)
    }
  });
}));

// ============================================================================
// Integration: Push journal insights to Twins Brain, Mem0, and Soul Signature
// ============================================================================
async function pushJournalToIntegrations(userId, entry, analysis) {
  console.log(`[Journal Integration] Pushing insights for entry ${entry.id} to brain, memory, and soul signature`);

  // 1. Push personality signals as Twins Brain nodes
  try {
    const { twinsBrainService } = await import('../services/twinsBrainService.js');

    // Add personality signal nodes
    for (const signal of (analysis.personality_signals || [])) {
      try {
        await twinsBrainService.addNode(userId, {
          node_type: 'trait',
          category: 'personal',
          label: `${signal.direction} ${signal.trait}`,
          confidence: 0.7,
          strength: 0.6,
          platform: 'journal',
          data: {
            abstraction_level: 3, // Personality trait level
            trait: signal.trait,
            direction: signal.direction,
            evidence: signal.evidence,
            source_entry_id: entry.id,
            source_date: entry.created_at
          }
        });
      } catch (nodeErr) {
        // Node might already exist, try to reinforce it instead
        try {
          const existingNodes = await twinsBrainService.findNodes(userId, {
            labelPattern: `${signal.direction} ${signal.trait}`,
            nodeType: 'trait',
            limit: 1
          });
          if (existingNodes.length > 0) {
            await twinsBrainService.reinforceNode(userId, existingNodes[0].id, {
              evidenceSource: 'journal',
              confidenceBoost: 0.05,
              newEvidence: { entry_id: entry.id, evidence: signal.evidence, date: entry.created_at }
            });
          }
        } catch (_) { /* best effort */ }
      }
    }

    // Add theme nodes as interests
    for (const theme of (analysis.themes || [])) {
      try {
        await twinsBrainService.addNode(userId, {
          node_type: 'interest',
          category: 'personal',
          label: theme,
          confidence: 0.6,
          strength: 0.5,
          platform: 'journal',
          data: {
            abstraction_level: 2, // Preference level
            source: 'journal_entry',
            source_entry_id: entry.id,
            source_date: entry.created_at
          }
        });
      } catch (_) {
        // Already exists - reinforce
        try {
          const existing = await twinsBrainService.findNodes(userId, {
            labelPattern: theme,
            nodeType: 'interest',
            limit: 1
          });
          if (existing.length > 0) {
            await twinsBrainService.reinforceNode(userId, existing[0].id, {
              evidenceSource: 'journal',
              confidenceBoost: 0.05
            });
          }
        } catch (__) { /* best effort */ }
      }
    }

    // Add self-perception as an identity node
    if (analysis.self_perception?.how_they_see_themselves) {
      try {
        await twinsBrainService.addNode(userId, {
          node_type: 'identity',
          category: 'personal',
          label: `Self-perception: ${analysis.self_perception.how_they_see_themselves.substring(0, 80)}`,
          confidence: 0.8,
          strength: 0.7,
          platform: 'journal',
          data: {
            abstraction_level: 4, // Core identity level
            full_text: analysis.self_perception.how_they_see_themselves,
            values: analysis.self_perception.values_expressed,
            source_entry_id: entry.id,
            source_date: entry.created_at
          }
        });
      } catch (_) { /* best effort */ }
    }

    console.log('[Journal Integration] Pushed to Twins Brain successfully');
  } catch (brainErr) {
    console.warn('[Journal Integration] Twins Brain push failed:', brainErr.message);
  }

  // 2. Push facts to Mem0 long-term memory
  try {
    const { addUserFact, addPlatformMemory } = await import('../services/mem0Service.js');

    // Store the AI summary as a memory fact
    if (analysis.summary) {
      await addUserFact(userId, `Journal insight: ${analysis.summary}`, 'journal');
    }

    // Store dominant emotions as a memory
    if (analysis.emotions?.length > 0) {
      const topEmotions = analysis.emotions
        .sort((a, b) => b.intensity - a.intensity)
        .slice(0, 3)
        .map(e => `${e.emotion} (${Math.round(e.intensity * 100)}%)`)
        .join(', ');
      const dateStr = new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      await addUserFact(userId, `On ${dateStr}, was feeling: ${topEmotions}`, 'journal');
    }

    // Store values as personality memories
    if (analysis.self_perception?.values_expressed?.length > 0) {
      await addPlatformMemory(userId, 'journal', 'self_perception', {
        values: analysis.self_perception.values_expressed,
        self_view: analysis.self_perception.how_they_see_themselves,
        themes: analysis.themes,
        date: entry.created_at
      });
    }

    console.log('[Journal Integration] Pushed to Mem0 successfully');
  } catch (memErr) {
    console.warn('[Journal Integration] Mem0 push failed:', memErr.message);
  }

  // 3. Trigger soul signature rebuild (fire-and-forget)
  try {
    const { default: soulBuilder } = await import('../services/soulSignatureBuilder.js');
    const result = await soulBuilder.buildSoulSignature(userId);
    console.log(`[Journal Integration] Soul signature rebuilt: ${result.success ? 'success' : 'no data'}`);
  } catch (soulErr) {
    console.warn('[Journal Integration] Soul signature rebuild failed:', soulErr.message);
  }
}

export default router;
