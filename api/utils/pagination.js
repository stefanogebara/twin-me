// api/utils/pagination.js
// Reusable pagination helpers following the journal.js pattern:
//   { data: [...], pagination: { page, limit, total, totalPages } }

/**
 * Parse and clamp pagination query params from an Express request.
 * @param {import('express').Request} req
 * @param {{ defaultLimit?: number, maxLimit?: number }} opts
 * @returns {{ page: number, limit: number, offset: number }}
 */
export function parsePagination(req, { defaultLimit = 20, maxLimit = 50 } = {}) {
  const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit, 10) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Build a standardised pagination metadata object.
 * @param {number} page   - Current page number
 * @param {number} limit  - Items per page
 * @param {number} total  - Total matching rows
 * @returns {{ page: number, limit: number, total: number, totalPages: number }}
 */
export function buildPaginationMeta(page, limit, total) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Apply Supabase-style range pagination to a query builder.
 * Expects the builder to support `.range(from, to)` and `{ count: 'exact' }` in the select.
 *
 * @param {import('@supabase/supabase-js').PostgrestFilterBuilder} query - Supabase query builder
 *   (must have been started with `.select('...', { count: 'exact' })`)
 * @param {{ offset: number, limit: number }} pagination
 * @returns {import('@supabase/supabase-js').PostgrestFilterBuilder} The same builder with range applied
 */
export function applySupabaseRange(query, { offset, limit }) {
  return query.range(offset, offset + limit - 1);
}

export default { parsePagination, buildPaginationMeta, applySupabaseRange };
