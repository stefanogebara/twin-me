-- Returns daily spend + avg stress score for the last 30 days per user.
-- Used by the StressSpendTimeline chart.
CREATE OR REPLACE FUNCTION get_spending_timeline(p_user_id UUID)
RETURNS TABLE (
  day          DATE,
  spend        NUMERIC,
  stress_avg   NUMERIC,
  stress_shop_count BIGINT,
  tx_count     BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    DATE(ut.transaction_date AT TIME ZONE 'UTC')                         AS day,
    ROUND(SUM(CASE WHEN ut.amount < 0 THEN ABS(ut.amount) ELSE 0 END)::NUMERIC, 2) AS spend,
    ROUND(AVG(tec.computed_stress_score)::NUMERIC, 3)                    AS stress_avg,
    COUNT(CASE WHEN tec.is_stress_shop_candidate = true THEN 1 END)      AS stress_shop_count,
    COUNT(*)                                                              AS tx_count
  FROM user_transactions ut
  LEFT JOIN transaction_emotional_context tec ON tec.transaction_id = ut.id
  WHERE ut.user_id = p_user_id
    AND ut.transaction_date >= NOW() - INTERVAL '30 days'
    AND ut.amount < 0
  GROUP BY DATE(ut.transaction_date AT TIME ZONE 'UTC')
  ORDER BY day ASC;
$$;

GRANT EXECUTE ON FUNCTION get_spending_timeline(UUID) TO service_role;
