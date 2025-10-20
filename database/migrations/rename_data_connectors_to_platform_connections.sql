-- Migration: Rename data_connectors table to platform_connections
-- Date: 2025-01-18
-- Purpose: Align database schema with codebase (Phase 2 debugging fix)

-- Step 1: Rename the table
ALTER TABLE IF EXISTS public.data_connectors
RENAME TO platform_connections;

-- Step 2: Rename the column 'provider' to 'platform' if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'platform_connections'
    AND column_name = 'provider'
  ) THEN
    ALTER TABLE public.platform_connections
    RENAME COLUMN provider TO platform;
  END IF;
END $$;

-- Step 3: Update any indexes that reference the old table name
-- (PostgREST will handle most index renames automatically)

-- Step 4: Update RLS policies to reference new table name (if needed)
-- Note: RLS policies are usually recreated rather than renamed

-- Verify the migration
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'platform_connections'
ORDER BY ordinal_position;
