CREATE TABLE IF NOT EXISTS user_github_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  github_username text NOT NULL,
  access_token  text NOT NULL,
  scopes        text[] DEFAULT '{}',
  connected_at  timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  needs_reauth  boolean NOT NULL DEFAULT false,
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_github_config_user_id ON user_github_config(user_id);
ALTER TABLE user_github_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own github config" ON user_github_config
  FOR ALL USING (user_id = auth.uid());
