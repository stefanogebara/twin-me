/**
 * Two-phase MMR must stay equivalent to in-process mmrRerank() (#233).
 *
 * retrieveMemories now asks the database for candidates WITHOUT embeddings
 * (search_memory_stream_light) and delegates the greedy rerank to mmr_select,
 * because shipping `embedding::TEXT` cost 19,225 bytes/row against 140 bytes
 * of content and starved two retrieval legs of their 5s budget.
 *
 * The selection MUST be identical: MMR's weights were tuned over 16+ eval
 * sessions, so any divergence silently moves ranking quality. This asserts
 * that phase 1 returns the same rows/scores as the heavy RPC, and that phase 2
 * picks the same memories in the same order as the JS implementation.
 *
 * Integration test — needs a real database. Skips when credentials are absent
 * so unit runs stay hermetic.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import dotenv from 'dotenv';

// Load .env before the capability check — it runs at module scope, ahead of
// whatever the imported services do.
dotenv.config();

const HAS_DB = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const d = HAS_DB ? describe : describe.skip;

let supabaseAdmin, mmrRerank, cfg, userId, probeEmbedding;

d('two-phase MMR equivalence', () => {
  // Explicit hook timeout: this beforeAll dynamically imports the full
  // memoryStreamService module graph (cold transform under parallel-worker
  // load) AND does a live Supabase round-trip. Both are slow-but-deterministic
  // under full-suite contention; the 10s default hookTimeout tripped
  // nondeterministically on loaded machines.
  beforeAll(async () => {
    ({ supabaseAdmin } = await import('../../../api/services/database.js'));
    ({ mmrRerank } = await import('../../../api/services/memoryStreamService.js'));
    cfg = await import('../../../twin-research/twin-config.js');

    const { data } = await supabaseAdmin
      .from('user_memories')
      .select('user_id, embedding')
      .not('embedding', 'is', null)
      .limit(1)
      .single();
    userId = data?.user_id;
    probeEmbedding = data?.embedding;
  }, 120_000);

  const shapes = [
    { limit: 40, final: 24, types: null, label: 'all types, prunes' },
    { limit: 30, final: 8, types: ['conversation'], label: 'type-filtered' },
    { limit: 12, final: 20, types: null, label: 'short-circuit (fewer than final)' },
  ];

  for (const s of shapes) {
    it(`phase 1 returns the same rows and scores as the heavy RPC — ${s.label}`, async () => {
      if (!userId) return;
      const args = {
        p_user_id: userId, p_query_embedding: probeEmbedding, p_limit: s.limit,
        p_decay_factor: 0.995, p_weight_recency: 0.0, p_weight_importance: 0.5,
        p_weight_relevance: 1.0, p_memory_types: s.types, p_include_superseded: false,
      };
      const [{ data: heavy }, { data: light }] = await Promise.all([
        supabaseAdmin.rpc('search_memory_stream', args),
        supabaseAdmin.rpc('search_memory_stream_light', args),
      ]);

      expect(light.map(r => r.id)).toEqual(heavy.map(r => r.id));
      light.forEach((r, i) => expect(r.score).toBeCloseTo(heavy[i].score, 9));
      // The entire point: no embeddings on the wire.
      expect(light.every(r => r.embedding === undefined)).toBe(true);
      // 60s: live Supabase RPCs over the founder's ~24k-memory corpus — 30s
      // tripped under cold-cache/parallel-suite load while passing warm.
    }, 60_000);

    it(`phase 2 selects identically to mmrRerank — ${s.label}`, async () => {
      if (!userId) return;
      const { data: heavy } = await supabaseAdmin.rpc('search_memory_stream', {
        p_user_id: userId, p_query_embedding: probeEmbedding, p_limit: s.limit,
        p_decay_factor: 0.995, p_weight_recency: 0.0, p_weight_importance: 0.5,
        p_weight_relevance: 1.0, p_memory_types: s.types, p_include_superseded: false,
      });
      if (!heavy?.length) return;

      const jsIds = mmrRerank(heavy, s.final, cfg.MMR_LAMBDA).map(m => m.id);

      const { data: selected, error } = await supabaseAdmin.rpc('mmr_select', {
        p_ids: heavy.map(r => r.id),
        p_scores: heavy.map(r => r.score),
        p_final_limit: s.final,
        p_lambda: cfg.MMR_LAMBDA,
        p_tdw: cfg.TYPE_DIVERSITY_WEIGHT,
        p_sdw: cfg.SEMANTIC_DIVERSITY_WEIGHT,
        p_temporal: cfg.TEMPORAL_DIVERSITY_WEIGHT,
      });

      expect(error).toBeNull();
      // Order matters — MMR output order is the selection order.
      expect(selected.map(r => r.id)).toEqual(jsIds);
    }, 60_000);
  }

  it('light RPC accepts the partial call shapes PostgREST sends', async () => {
    if (!userId) return;
    // Callers omit trailing params; without matching DEFAULTs these fail
    // PGRST202. Regression guard for the live failure on the reflections and
    // fact-pool legs.
    const { error: noTypes } = await supabaseAdmin.rpc('search_memory_stream_light', {
      p_user_id: userId, p_query_embedding: probeEmbedding, p_limit: 5,
      p_decay_factor: 0.995, p_weight_recency: 0.0,
      p_weight_importance: 0.5, p_weight_relevance: 1.0,
    });
    expect(noTypes).toBeNull();

    const { error: withTypes } = await supabaseAdmin.rpc('search_memory_stream_light', {
      p_user_id: userId, p_query_embedding: probeEmbedding, p_limit: 5,
      p_decay_factor: 0.995, p_weight_recency: 0.0,
      p_weight_importance: 0.5, p_weight_relevance: 1.0,
      p_memory_types: ['fact'],
    });
    expect(withTypes).toBeNull();
  }, 60_000);
});
