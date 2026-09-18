-- Include occurrence-suffixed temporary identities when a bank assigns stable references.
-- Owner scope and the bounded reconciliation window remain unchanged.
CREATE OR REPLACE FUNCTION public.prepare_money_ingestion(p_user_id uuid, p_sightings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF p_user_id IS NULL OR jsonb_typeof(p_sightings) <> 'array'
     OR jsonb_array_length(p_sightings) NOT BETWEEN 1 AND 250 THEN
    RAISE EXCEPTION 'invalid ingestion request';
  END IF;
  INSERT INTO money_ingestion_revisions(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
  -- One statement/snapshot: a concurrent commit cannot mix an old revision with new rows.
  WITH input AS (
    SELECT * FROM jsonb_to_recordset(p_sightings) AS s(source text, source_ref text, legacy_refs jsonb, occurred_at timestamptz)
  ), prior AS (
    SELECT s.* FROM money_sightings s WHERE s.user_id=p_user_id AND EXISTS (
      SELECT FROM input i WHERE i.source=s.source AND
        (i.source_ref=s.source_ref OR COALESCE(i.legacy_refs, '[]'::jsonb) ? s.source_ref
          OR EXISTS (SELECT FROM jsonb_array_elements_text(COALESCE(i.legacy_refs,'[]'::jsonb)) a(ref)
            WHERE (a.ref LIKE 'pend:%' OR a.ref LIKE 'bank:fallback:%')
              AND left(s.source_ref,length(a.ref)+1)=a.ref || '#'
              AND substring(s.source_ref FROM length(a.ref)+2) ~ '^[0-9]+$'))
    )
  ), candidates AS (
    SELECT t.*, prim.source AS primary_source, prim.raw_json->>'status' AS primary_status,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'source',s.source,'status',s.raw_json->>'status'))
        FROM money_sightings s WHERE s.user_id=p_user_id AND s.transaction_id=t.id), '[]'::jsonb) AS backings
    FROM money_transactions t LEFT JOIN money_sightings prim ON prim.id=t.primary_sighting_id AND prim.user_id=p_user_id
    WHERE t.user_id=p_user_id AND (
      t.occurred_at BETWEEN (SELECT min(occurred_at) - interval '4 days' FROM input)
                       AND (SELECT max(occurred_at) + interval '4 days' FROM input)
      OR t.id IN (SELECT transaction_id FROM prior)
    ) ORDER BY t.occurred_at,t.id LIMIT 10001
  )
  SELECT jsonb_build_object(
    'revision', r.revision,
    'sightings', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM prior p), '[]'::jsonb),
    'transactions', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM candidates t), '[]'::jsonb)
  ) INTO result FROM money_ingestion_revisions r WHERE r.user_id=p_user_id;
  IF jsonb_array_length(result->'transactions') > 10000 THEN
    RAISE EXCEPTION 'ingestion window too large; split the import';
  END IF;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.prepare_money_ingestion(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_money_ingestion(uuid,jsonb) TO service_role;
