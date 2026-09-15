-- Presence: the two family writes that must not half-happen
-- ==========================================================
-- Called by api/services/presenceStore.js on design/twinme-cosmos
-- (replaceActivePeople, saveFact). NOT applied anywhere yet. Apply it by hand
-- (SQL editor or Supabase MCP apply_migration) before deploying the Presence API
-- that calls it; until then PUT /api/presence/:id/people and
-- POST /api/presence/:id/facts answer 500.
--
-- presence_replace_people
--   PUT /:id/people used to soft-delete the active family map and then insert
--   the new one as two separate requests, so a failed insert left no family map
--   at all. Here both run in one transaction: any failed row rolls the
--   soft-delete back. The presences row lock makes two concurrent replaces of
--   one map run in turn, so the result is always exactly one submitted map.
--
-- presence_save_fact
--   POST /:id/facts looked the active (kind, question) fact up and then updated
--   or inserted it, so two concurrent saves could both miss and both insert.
--   A unique partial index on (presence_id, kind, question) WHERE status =
--   'active' cannot fix this: POST /:id/about stores every boundary under
--   'From the family' and several anchors under one 'A place that matters', and
--   the call summary repeats questions, so repeated (kind, question) pairs are
--   legitimate for those writers. Instead the save holds a transaction-scoped
--   advisory lock on (presence, kind, question), which serializes only saves of
--   the same fact. With duplicates already present it updates the newest.

CREATE OR REPLACE FUNCTION public.presence_replace_people(p_presence_id uuid, p_people jsonb)
RETURNS TABLE (id uuid, name text, relation text, called_by text)
LANGUAGE sql
SET search_path = public
AS $$
  -- NO KEY UPDATE serializes replaces without blocking inserts that reference the row.
  SELECT 1 FROM presences WHERE presences.id = p_presence_id FOR NO KEY UPDATE;

  UPDATE presence_people
     SET status = 'deleted', updated_at = now()
   WHERE presence_people.presence_id = p_presence_id
     AND presence_people.status = 'active';

  INSERT INTO presence_people (presence_id, name, relation, called_by)
  SELECT p_presence_id, person.name, coalesce(person.relation, ''), coalesce(person.called_by, '')
    FROM jsonb_to_recordset(coalesce(p_people, '[]'::jsonb)) AS person(name text, relation text, called_by text)
  RETURNING presence_people.id, presence_people.name, presence_people.relation, presence_people.called_by;
$$;

CREATE OR REPLACE FUNCTION public.presence_save_fact(
  p_presence_id uuid, p_kind text, p_question text, p_answer text, p_source text
)
RETURNS TABLE (id uuid, kind text, question text, answer text)
LANGUAGE sql
SET search_path = public
AS $$
  SELECT pg_advisory_xact_lock(
    hashtextextended(concat_ws(chr(31), 'presence_save_fact', p_presence_id::text, p_kind, p_question), 0)
  );

  WITH current_fact AS (
    SELECT f.id
      FROM presence_facts f
     WHERE f.presence_id = p_presence_id
       AND f.kind = p_kind
       AND f.question = p_question
       AND f.status = 'active'
     ORDER BY f.created_at DESC
     LIMIT 1
  ),
  updated AS (
    UPDATE presence_facts f
       SET answer = p_answer, source = p_source, updated_at = now()
      FROM current_fact
     WHERE f.id = current_fact.id
    RETURNING f.id, f.kind, f.question, f.answer
  ),
  inserted AS (
    INSERT INTO presence_facts (presence_id, kind, question, answer, source)
    SELECT p_presence_id, p_kind, p_question, p_answer, p_source
     WHERE NOT EXISTS (SELECT 1 FROM current_fact)
    RETURNING presence_facts.id, presence_facts.kind, presence_facts.question, presence_facts.answer
  )
  SELECT * FROM updated
  UNION ALL
  SELECT * FROM inserted;
$$;

-- Server-only, like the tables: Supabase grants EXECUTE on new public functions
-- to anon and authenticated by default.
REVOKE EXECUTE ON FUNCTION public.presence_replace_people(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.presence_save_fact(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.presence_replace_people(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.presence_save_fact(uuid, text, text, text, text) TO service_role;
