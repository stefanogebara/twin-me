-- The language a person chose for TwinMe: en, es or pt-BR. Null until asked on their first
-- sign-in; changeable in Settings. Read by the twin (its replies) and by the app (its copy).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS preferred_language text
  CHECK (preferred_language IS NULL OR preferred_language IN ('en', 'es', 'pt-BR'));
