-- Add budget_month + updated_at to department_budgets.
--
-- Context (prod logs 2026-08-24): every default-budget upsert failed with
-- "Could not find the 'budget_month' column of 'department_budgets'" for all
-- six departments on every context warmup. The table in prod matches
-- 20260408_soulos_departments.sql (reset_day/last_reset, no budget_month, no
-- updated_at), but departmentBudgetService.js was later rewritten around a
-- budget_month TEXT ('YYYY-MM') column and writes updated_at on every
-- insert/update. This aligns the schema with the service.

ALTER TABLE department_budgets ADD COLUMN IF NOT EXISTS budget_month TEXT;
ALTER TABLE department_budgets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill existing rows so resetMonthlyBudgets()'s
-- neq('budget_month', currentMonth) doesn't treat them all as stale.
UPDATE department_budgets
SET budget_month = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')
WHERE budget_month IS NULL;

-- Refresh PostgREST's schema cache so the API sees the new columns.
NOTIFY pgrst, 'reload schema';
