-- Add rendered_system_prompt column to mcp_conversation_logs
-- Stores the full system prompt used for each conversation turn
-- Enables high-quality fine-tuning data export

ALTER TABLE mcp_conversation_logs
ADD COLUMN IF NOT EXISTS rendered_system_prompt TEXT;

COMMENT ON COLUMN mcp_conversation_logs.rendered_system_prompt IS 'Full rendered system prompt used for this conversation turn, for fine-tuning data export';
