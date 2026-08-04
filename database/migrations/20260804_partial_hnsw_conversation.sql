-- Partial HNSW index for type-filtered vector search (part of issue #233).
--
-- Problem: when search_memory_stream is called with p_memory_types, the planner
-- cannot use the global HNSW index to satisfy both the type filter and the
-- distance ordering. It falls back to the btree (user_id, memory_type) index,
-- pulls every matching row, and brute-force sorts by distance. Worse, through
-- PostgREST the call frequently returns NOTHING rather than being merely slow.
--
-- Measured 2026-08-04, identical query shape and probe vector:
--
--   memory_type='conversation'  (before this index)  ->   0 rows
--   memory_type='conversation'  (with this index)    ->  30 rows, 386ms
--   memory_type='reflection'    (no such index)      ->   0 rows, 564ms
--
-- The standalone plan showed the cost directly: Index Scan on
-- idx_user_memories_user_type pulling all 7,219 conversations, then a top-N
-- heapsort on `embedding <=> $1` — 5.6s, with the vector index unused.
--
-- Zero rows is why the semantic_conv leg contributed nothing to twin context.
--
-- Only 'conversation' is indexed: it is the ONLY type passed as a SQL-level
-- filter (memoryStreamService.js:1691 is the sole caller supplying
-- `memoryTypes`). The reflections leg searches unfiltered and post-filters in
-- JS. Add further partial indexes only when a new caller starts filtering on
-- another type — each costs storage on a 567MB table.
--
-- CONCURRENTLY: built without locking writes on a live table.
--
-- NOTE: this is a partial fix. It repairs correctness (rows are returned at
-- all) and query time, but the legs still exceed their 5s budget because the
-- RPC ships ~19KB of embedding text per candidate row. See #233 for the
-- remaining payload work.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_memories_embedding_conversation
  ON user_memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE memory_type = 'conversation';
