-- RPC functions for AdminLLMCosts dashboard aggregation
-- Called by api/routes/admin-llm-costs.js

-- 1. Summary by tier, model, service
CREATE OR REPLACE FUNCTION aggregate_llm_costs_summary(since_date timestamptz)
RETURNS TABLE (
  tier text,
  model text,
  service_name text,
  call_count bigint,
  total_input_tokens bigint,
  total_output_tokens bigint,
  total_cost_usd numeric,
  cache_hits bigint
) LANGUAGE sql STABLE AS $$
  SELECT
    tier,
    model,
    service_name,
    count(*)::bigint AS call_count,
    coalesce(sum(input_tokens), 0)::bigint AS total_input_tokens,
    coalesce(sum(output_tokens), 0)::bigint AS total_output_tokens,
    coalesce(sum(cost_usd), 0)::numeric AS total_cost_usd,
    count(*) FILTER (WHERE cache_hit = true)::bigint AS cache_hits
  FROM llm_usage_log
  WHERE created_at >= since_date
  GROUP BY tier, model, service_name
  ORDER BY total_cost_usd DESC;
$$;

-- 2. Daily breakdown by tier
CREATE OR REPLACE FUNCTION aggregate_llm_costs_daily(since_date timestamptz)
RETURNS TABLE (
  day date,
  tier text,
  call_count bigint,
  total_cost_usd numeric,
  cache_hits bigint
) LANGUAGE sql STABLE AS $$
  SELECT
    (created_at AT TIME ZONE 'UTC')::date AS day,
    tier,
    count(*)::bigint AS call_count,
    coalesce(sum(cost_usd), 0)::numeric AS total_cost_usd,
    count(*) FILTER (WHERE cache_hit = true)::bigint AS cache_hits
  FROM llm_usage_log
  WHERE created_at >= since_date
  GROUP BY day, tier
  ORDER BY day DESC, tier;
$$;

-- 3. Per-user aggregation
CREATE OR REPLACE FUNCTION aggregate_llm_costs_by_user(since_date timestamptz)
RETURNS TABLE (
  user_id uuid,
  call_count bigint,
  total_cost_usd numeric,
  total_tokens bigint
) LANGUAGE sql STABLE AS $$
  SELECT
    user_id,
    count(*)::bigint AS call_count,
    coalesce(sum(cost_usd), 0)::numeric AS total_cost_usd,
    coalesce(sum(input_tokens) + sum(output_tokens), 0)::bigint AS total_tokens
  FROM llm_usage_log
  WHERE created_at >= since_date
  GROUP BY user_id
  ORDER BY total_cost_usd DESC;
$$;
