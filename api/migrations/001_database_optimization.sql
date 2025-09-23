-- Database Optimization and Indexing Migration
-- This file contains performance optimizations for the Twin AI platform

-- =======================
-- PERFORMANCE INDEXES
-- =======================

-- Digital Twins table optimizations
-- Index for creator_id lookups (most common query)
CREATE INDEX IF NOT EXISTS idx_digital_twins_creator_id
ON digital_twins (creator_id);

-- Index for active professor twins (public endpoint)
CREATE INDEX IF NOT EXISTS idx_digital_twins_active_professor
ON digital_twins (is_active, twin_type)
WHERE is_active = true AND twin_type = 'professor';

-- Composite index for twin type and active status
CREATE INDEX IF NOT EXISTS idx_digital_twins_type_active
ON digital_twins (twin_type, is_active);

-- Index for created_at for ordering
CREATE INDEX IF NOT EXISTS idx_digital_twins_created_at
ON digital_twins (created_at DESC);

-- Conversations table optimizations
-- Index for user conversations
CREATE INDEX IF NOT EXISTS idx_conversations_user_id
ON conversations (user_id);

-- Index for twin conversations
CREATE INDEX IF NOT EXISTS idx_conversations_twin_id
ON conversations (twin_id);

-- Composite index for user + twin + created_at (for pagination)
CREATE INDEX IF NOT EXISTS idx_conversations_user_twin_created
ON conversations (user_id, twin_id, created_at DESC);

-- Index for conversation status
CREATE INDEX IF NOT EXISTS idx_conversations_status
ON conversations (status);

-- Messages table optimizations
-- Index for conversation messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
ON messages (conversation_id);

-- Index for message timestamps (for ordering)
CREATE INDEX IF NOT EXISTS idx_messages_created_at
ON messages (created_at DESC);

-- Composite index for conversation + timestamp (most common query)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
ON messages (conversation_id, created_at DESC);

-- Index for user messages (for analytics)
CREATE INDEX IF NOT EXISTS idx_messages_is_user_message
ON messages (is_user_message);

-- Profiles table optimizations
-- Index for user_id (primary lookup)
CREATE INDEX IF NOT EXISTS idx_profiles_user_id
ON profiles (user_id);

-- Index for email (secondary lookup)
CREATE INDEX IF NOT EXISTS idx_profiles_email
ON profiles (email);

-- Index for learning style (for personalization)
CREATE INDEX IF NOT EXISTS idx_profiles_learning_style
ON profiles USING GIN (learning_style);

-- Document chunks table optimizations (for RAG)
-- Index for twin_id (for document retrieval)
CREATE INDEX IF NOT EXISTS idx_document_chunks_twin_id
ON document_chunks (twin_id);

-- Index for document_id (for document management)
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id
ON document_chunks (document_id);

-- Vector similarity index (if using pgvector)
-- CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
-- ON document_chunks USING ivfflat (embedding vector_cosine_ops);

-- =======================
-- TABLE OPTIMIZATIONS
-- =======================

-- Add missing foreign key constraints for data integrity
ALTER TABLE conversations
ADD CONSTRAINT fk_conversations_user_id
FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;

ALTER TABLE conversations
ADD CONSTRAINT fk_conversations_twin_id
FOREIGN KEY (twin_id) REFERENCES digital_twins(id) ON DELETE CASCADE;

ALTER TABLE messages
ADD CONSTRAINT fk_messages_conversation_id
FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- Add check constraints for data validation
ALTER TABLE digital_twins
ADD CONSTRAINT chk_twin_type
CHECK (twin_type IN ('professor', 'personal'));

ALTER TABLE conversations
ADD CONSTRAINT chk_conversation_status
CHECK (status IN ('active', 'completed', 'archived'));

-- =======================
-- PERFORMANCE VIEWS
-- =======================

-- View for active professor twins with creator info
CREATE OR REPLACE VIEW active_professor_twins AS
SELECT
    dt.id,
    dt.name,
    dt.description,
    dt.subject_area,
    dt.created_at,
    dt.personality_traits,
    dt.teaching_style,
    p.first_name || ' ' || p.last_name AS creator_name,
    p.email AS creator_email
FROM digital_twins dt
LEFT JOIN profiles p ON dt.creator_id = p.user_id
WHERE dt.is_active = true AND dt.twin_type = 'professor';

-- View for conversation summaries with message counts
CREATE OR REPLACE VIEW conversation_summaries AS
SELECT
    c.id,
    c.user_id,
    c.twin_id,
    c.title,
    c.status,
    c.created_at,
    c.updated_at,
    dt.name AS twin_name,
    COUNT(m.id) AS message_count,
    MAX(m.created_at) AS last_message_at
FROM conversations c
JOIN digital_twins dt ON c.twin_id = dt.id
LEFT JOIN messages m ON c.id = m.conversation_id
GROUP BY c.id, dt.name;

-- =======================
-- MAINTENANCE FUNCTIONS
-- =======================

-- Function to clean up old conversations
CREATE OR REPLACE FUNCTION cleanup_old_conversations(days_old INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM conversations
    WHERE status = 'archived'
    AND updated_at < NOW() - INTERVAL '1 day' * days_old;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update conversation updated_at on new messages
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations
    SET updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update conversation timestamps
DROP TRIGGER IF EXISTS trigger_update_conversation_timestamp ON messages;
CREATE TRIGGER trigger_update_conversation_timestamp
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_timestamp();

-- =======================
-- STATISTICS UPDATE
-- =======================

-- Update table statistics for better query planning
ANALYZE digital_twins;
ANALYZE conversations;
ANALYZE messages;
ANALYZE profiles;
ANALYZE document_chunks;

-- =======================
-- VACUUM AND MAINTENANCE
-- =======================

-- Vacuum tables to reclaim space and update statistics
VACUUM ANALYZE digital_twins;
VACUUM ANALYZE conversations;
VACUUM ANALYZE messages;
VACUUM ANALYZE profiles;

COMMENT ON INDEX idx_digital_twins_creator_id IS 'Optimizes queries filtering by creator_id';
COMMENT ON INDEX idx_conversations_user_twin_created IS 'Optimizes user conversation history queries with pagination';
COMMENT ON INDEX idx_messages_conversation_created IS 'Optimizes message retrieval for conversations';
COMMENT ON VIEW active_professor_twins IS 'Provides optimized access to active professor twins with creator information';
COMMENT ON FUNCTION cleanup_old_conversations IS 'Removes archived conversations older than specified days';