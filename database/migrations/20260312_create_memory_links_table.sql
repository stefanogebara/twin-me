-- Memory links table for synaptic maturation (graph-based retrieval, STDP decay)
-- Idempotent: only creates if not exists

CREATE TABLE IF NOT EXISTS memory_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_memory_id uuid NOT NULL REFERENCES user_memories(id) ON DELETE CASCADE,
  target_memory_id uuid NOT NULL REFERENCES user_memories(id) ON DELETE CASCADE,
  link_type text NOT NULL DEFAULT 'semantic',
  strength double precision NOT NULL DEFAULT 0.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_reinforced_at timestamptz,
  UNIQUE (source_memory_id, target_memory_id)
);

-- Indexes for efficient traversal and decay queries
CREATE INDEX IF NOT EXISTS idx_memory_links_source ON memory_links(source_memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_links_target ON memory_links(target_memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_links_user ON memory_links(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_links_updated_at ON memory_links(updated_at);
CREATE INDEX IF NOT EXISTS idx_memory_links_last_reinforced_at ON memory_links(last_reinforced_at) WHERE link_type = 'co_citation';

-- RLS
ALTER TABLE memory_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'memory_links' AND policyname = 'Users can manage own memory links') THEN
    CREATE POLICY "Users can manage own memory links" ON memory_links
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- Service role bypass
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'memory_links' AND policyname = 'Service role full access to memory_links') THEN
    CREATE POLICY "Service role full access to memory_links" ON memory_links
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
