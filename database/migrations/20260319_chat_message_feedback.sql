-- Chat message feedback for DPO training pipeline (Phase 1)
-- Stores thumbs up/down ratings on twin chat messages
CREATE TABLE IF NOT EXISTS chat_message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message_id UUID,
  conversation_id UUID,
  rating INTEGER NOT NULL CHECK (rating IN (-1, 1)),
  message_content TEXT NOT NULL,
  user_message TEXT,
  model_version TEXT DEFAULT 'unknown',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_feedback_user ON chat_message_feedback(user_id, created_at DESC);
CREATE INDEX idx_chat_feedback_rating ON chat_message_feedback(user_id, rating);
