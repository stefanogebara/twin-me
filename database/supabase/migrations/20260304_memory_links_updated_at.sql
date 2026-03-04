-- Add updated_at column to memory_links for STDP co-citation link decay tracking
-- Links not updated in 30 days will be decayed by cron-memory-forgetting Tier 4

ALTER TABLE memory_links ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_memory_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_memory_links_updated_at ON memory_links;
CREATE TRIGGER trigger_memory_links_updated_at
  BEFORE UPDATE ON memory_links
  FOR EACH ROW
  EXECUTE FUNCTION update_memory_links_updated_at();

-- Index for decay cleanup queries
CREATE INDEX IF NOT EXISTS idx_memory_links_updated_at ON memory_links(updated_at);
