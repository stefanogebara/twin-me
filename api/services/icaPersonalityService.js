/**
 * ICA Personality Service
 * =======================
 * Orchestrates Python ICA decomposition + LLM axis labeling + DB caching.
 *
 * Pipeline:
 *   1. Check personality_axes_cache (24h TTL)
 *   2. If stale → run Python ICA script on user's memory embeddings
 *   3. Label each axis via LLM (batched 5 at a time)
 *   4. Store in personality_axes + update cache metadata
 *
 * Usage:
 *   import { getPersonalityAxes, rebuildPersonalityAxes, getPersonalityVector } from './icaPersonalityService.js';
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from './database.js';
import { complete, TIER_EXTRACTION, TIER_ANALYSIS } from './llmGateway.js';
import { createLogger } from './logger.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = createLogger('ICAPersonality');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PYTHON_PATH = process.env.PYTHON_PATH || 'python';
const ICA_SCRIPT = path.resolve(__dirname, '../../scripts/personality_ica.py');
const MAX_EXEC_TIMEOUT = 120_000; // 120s (fetch 2000 memories ~13s + PCA+ICA ~1s + buffer)
const N_COMPONENTS = 20;

// ─── Cache Check ────────────────────────────────────────────────────────

/**
 * Check if cached axes are still fresh (within 24h TTL).
 * @param {string} userId
 * @returns {Promise<{ fresh: boolean, generatedAt: string|null }>}
 */
async function checkCache(userId) {
  const { data, error } = await supabaseAdmin
    .from('personality_axes_cache')
    .select('generated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    log.warn('Cache check failed', { userId, error: error.message });
    return { fresh: false, generatedAt: null };
  }

  if (!data?.generated_at) {
    return { fresh: false, generatedAt: null };
  }

  const age = Date.now() - new Date(data.generated_at).getTime();
  return { fresh: age < CACHE_TTL_MS, generatedAt: data.generated_at };
}

// ─── LLM Axis Labeling ─────────────────────────────────────────────────

/**
 * Label a single ICA axis using the top 10 memory contents.
 * @param {string[]} topMemories - Top 10 memory content strings for this axis
 * @param {number} axisIndex - Index for logging
 * @returns {Promise<{ label: string, description: string }>}
 */
async function labelAxis(topMemories, axisIndex) {
  const memoriesList = topMemories
    .map((m, i) => `${i + 1}. ${m}`)
    .join('\n');

  const prompt = `These 10 memories strongly activate the same personality dimension. What personality trait or behavioral pattern do they reveal?

Memories:
${memoriesList}

Respond in JSON only: {"label": "2-4 word label", "description": "1 sentence description"}`;

  try {
    const result = await complete({
      tier: TIER_ANALYSIS, // DeepSeek produces cleaner JSON than Mistral
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 100,
      serviceName: 'ica-axis-labeling',
    });

    const raw = (result?.content || result?.text || '').trim();
    // Strip markdown bold/italic markers and code fences
    const cleaned = raw.replace(/\*\*/g, '').replace(/```json?\n?/gi, '').replace(/```/g, '').trim();

    // Try JSON.parse first, then regex fallback
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          label: parsed.label || `Axis ${axisIndex + 1}`,
          description: parsed.description || '',
        };
      } catch {
        // JSON.parse failed on extracted block — fall through to regex
      }
    }

    // Regex fallback: extract label and description from raw text
    const labelMatch = raw.match(/"label"\s*:\s*"([^"]+)"/);
    const descMatch = raw.match(/"description"\s*:\s*"([^"]+)"/);
    if (labelMatch) {
      return { label: labelMatch[1], description: descMatch?.[1] || '' };
    }

    log.warn('LLM returned unparseable axis label', { axisIndex, text: raw.slice(0, 100) });
    return { label: `Axis ${axisIndex + 1}`, description: 'Unlabeled personality dimension' };
  } catch (err) {
    log.error('Axis labeling failed', { axisIndex, error: err.message });
    return { label: `Axis ${axisIndex + 1}`, description: 'Labeling failed' };
  }
}

/**
 * Label axes in parallel batches of 5.
 * @param {Array} axes - Raw axes from Python ICA output
 * @returns {Promise<Array>} Labeled axes
 */
async function labelAxesBatched(axes) {
  const labeled = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < axes.length; i += BATCH_SIZE) {
    const batch = axes.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((axis, batchIdx) =>
        labelAxis(axis.top_memory_contents || [], i + batchIdx)
      )
    );

    batchResults.forEach((labelResult, batchIdx) => {
      const axis = batch[batchIdx];
      labeled.push({
        ...axis,
        label: labelResult.label,
        description: labelResult.description,
      });
    });
  }

  return labeled;
}

// ─── Python ICA Execution ───────────────────────────────────────────────

/**
 * Execute the Python ICA script and parse output.
 * @param {string} userId
 * @returns {Promise<{ axes: Array }|{ error: string, message: string }>}
 */
async function runPythonICA(userId) {
  try {
    const { stdout, stderr } = await execFileAsync(
      PYTHON_PATH,
      [ICA_SCRIPT, '--user_id', userId, '--n_components', String(N_COMPONENTS)],
      {
        timeout: MAX_EXEC_TIMEOUT,
        maxBuffer: 50 * 1024 * 1024,
        env: { ...process.env },
      }
    );

    if (stderr) {
      log.warn('Python ICA stderr', { userId, stderr: stderr.substring(0, 500) });
    }

    const result = JSON.parse(stdout);

    if (result.error) {
      return { error: result.error, message: result.message || 'ICA computation failed' };
    }

    return result;
  } catch (err) {
    if (err.code === 'ENOENT') {
      log.error('Python not found', { pythonPath: PYTHON_PATH });
      return { error: 'python_not_found', message: `Python not found at ${PYTHON_PATH}. Set PYTHON_PATH env var.` };
    }
    if (err.killed || err.signal === 'SIGTERM') {
      log.error('ICA timed out', { userId, timeout: MAX_EXEC_TIMEOUT });
      return { error: 'timeout', message: `ICA computation timed out after ${MAX_EXEC_TIMEOUT / 1000}s` };
    }

    log.error('Python ICA failed', { userId, error: err.message });
    return { error: 'execution_failed', message: err.message };
  }
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Get personality axes for a user, using cache when fresh.
 * @param {string} userId
 * @returns {Promise<{ axes: Array, cached: boolean, generated_at: string }|{ error: string, message: string }>}
 */
export async function getPersonalityAxes(userId) {
  try {
    const { fresh, generatedAt } = await checkCache(userId);

    if (fresh) {
      const { data: axes, error } = await supabaseAdmin
        .from('personality_axes')
        .select('*')
        .eq('user_id', userId)
        .order('variance_explained', { ascending: false });

      if (error) {
        log.error('Failed to fetch cached axes', { userId, error: error.message });
        return { error: 'db_error', message: 'Failed to fetch personality axes' };
      }

      log.info('Returning cached axes', { userId, count: axes.length });
      return { axes: axes || [], cached: true, generated_at: generatedAt };
    }

    log.info('Cache stale or missing, rebuilding', { userId });
    return await rebuildPersonalityAxes(userId);
  } catch (err) {
    log.error('getPersonalityAxes failed', { userId, error: err.message });
    return { error: 'unexpected', message: err.message };
  }
}

/**
 * Full rebuild pipeline: Python ICA -> LLM labeling -> DB store -> cache update.
 * @param {string} userId
 * @returns {Promise<{ axes: Array, cached: boolean, generated_at: string }|{ error: string, message: string }>}
 */
export async function rebuildPersonalityAxes(userId) {
  try {
    log.info('Starting ICA rebuild', { userId, nComponents: N_COMPONENTS });

    // Step 1: Run Python ICA
    const icaResult = await runPythonICA(userId);

    if (icaResult.error) {
      return { error: icaResult.error, message: icaResult.message };
    }

    const rawAxes = icaResult.axes || [];
    if (rawAxes.length === 0) {
      log.warn('ICA returned zero axes', { userId });
      return { axes: [], cached: false, generated_at: new Date().toISOString() };
    }

    // Step 2: Label axes via LLM (batches of 5)
    const labeledAxes = await labelAxesBatched(rawAxes);

    // Step 3: Delete old axes
    const { error: deleteError } = await supabaseAdmin
      .from('personality_axes')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      log.error('Failed to delete old axes', { userId, error: deleteError.message });
      return { error: 'db_error', message: 'Failed to clear old personality axes' };
    }

    // Step 4: Batch insert new axes
    const now = new Date().toISOString();
    const rows = labeledAxes.map((axis, idx) => ({
      user_id: userId,
      axis_index: idx,
      label: axis.label,
      description: axis.description,
      mixing_vector: axis.mixing_vector,
      variance_explained: axis.variance_explained || 0,
      top_memory_ids: axis.top_memory_ids || [],
      top_memory_contents: axis.top_memory_contents || [],
      generated_at: now,
    }));

    const { error: insertError } = await supabaseAdmin
      .from('personality_axes')
      .insert(rows);

    if (insertError) {
      log.error('Failed to insert axes', { userId, error: insertError.message });
      return { error: 'db_error', message: 'Failed to store personality axes' };
    }

    // Step 5: Upsert cache metadata
    const { error: cacheError } = await supabaseAdmin
      .from('personality_axes_cache')
      .upsert(
        { user_id: userId, generated_at: now, n_components: rawAxes.length, n_memories_used: icaResult.n_memories || 0, total_variance_explained: icaResult.total_variance_explained || 0 },
        { onConflict: 'user_id' }
      );

    if (cacheError) {
      log.warn('Cache upsert failed (non-fatal)', { userId, error: cacheError.message });
    }

    log.info('ICA rebuild complete', { userId, axesCount: labeledAxes.length });
    return { axes: rows, cached: false, generated_at: now };
  } catch (err) {
    log.error('rebuildPersonalityAxes failed', { userId, error: err.message });
    return { error: 'unexpected', message: err.message };
  }
}

/**
 * Get personality vector representation: axes + centroid embedding.
 * @param {string} userId
 * @returns {Promise<{ axes: Array<{ label: string, mixing_vector: number[], variance_explained: number }>, centroid: number[]|null }>}
 */
export async function getPersonalityVector(userId) {
  try {
    // Fetch axes + centroid + multimodal features in parallel
    const [axesResult, profileResult, multimodalResult] = await Promise.all([
      supabaseAdmin
        .from('personality_axes')
        .select('label, mixing_vector, variance_explained')
        .eq('user_id', userId)
        .order('variance_explained', { ascending: false }),

      supabaseAdmin
        .from('user_personality_profiles')
        .select('personality_embedding')
        .eq('user_id', userId)
        .maybeSingle(),

      supabaseAdmin
        .from('multimodal_profiles')
        .select('fused_vector, modalities_present, modality_count')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (axesResult.error) {
      log.error('Failed to fetch axes for vector', { userId, error: axesResult.error.message });
    }
    if (profileResult.error) {
      log.warn('Failed to fetch personality centroid', { userId, error: profileResult.error.message });
    }

    return {
      axes: axesResult.data || [],
      centroid: profileResult.data?.personality_embedding || null,
      multimodal: multimodalResult.data ? {
        fused_vector: multimodalResult.data.fused_vector,
        modalities_present: multimodalResult.data.modalities_present,
        modality_count: multimodalResult.data.modality_count,
      } : null,
    };
  } catch (err) {
    log.error('getPersonalityVector failed', { userId, error: err.message });
    return { axes: [], centroid: null, multimodal: null };
  }
}
