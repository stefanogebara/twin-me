/**
 * Query-string builder for the Whoop v2 collection endpoints
 * (/recovery, /activity/sleep, /activity/workout, /cycle).
 *
 * The Whoop API only accepts strict ISO 8601 for start/end. This module
 * accepts our friendlier expressions ("today", "last 7 days", etc.) and
 * resolves them via dateUtils before serialising.
 *
 * Ported from shashankswe2020-ux/whoop-mcp (MIT, Copyright (c) 2025 Shashank Mishra).
 * Original: src/tools/collection-utils.ts. Logic preserved; types stripped.
 */

import { resolveDateExpression, InvalidDateExpression } from './dateUtils.js';

function resolveStart(value) {
  if (value === undefined || value === null) return undefined;
  try {
    return resolveDateExpression(value).start;
  } catch (e) {
    if (e instanceof InvalidDateExpression) throw e;
    return value;
  }
}

function resolveEnd(value) {
  if (value === undefined || value === null) return undefined;
  try {
    return resolveDateExpression(value).end;
  } catch (e) {
    if (e instanceof InvalidDateExpression) throw e;
    return value;
  }
}

/**
 * Build a query string from collection params, resolving relative date
 * expressions to ISO 8601 along the way. Returns "" for an empty param bag
 * so callers can do `${base}${buildCollectionQuery(p)}` unconditionally.
 *
 * @param {{ start?: string, end?: string, limit?: number, nextToken?: string }} params
 * @returns {string}
 */
export function buildCollectionQuery(params = {}) {
  const sp = new URLSearchParams();

  const start = resolveStart(params.start);
  const end = resolveEnd(params.end);

  if (start !== undefined) sp.set('start', start);
  if (end !== undefined) sp.set('end', end);
  if (params.limit !== undefined) sp.set('limit', String(params.limit));
  if (params.nextToken !== undefined) sp.set('nextToken', params.nextToken);

  const query = sp.toString();
  return query ? `?${query}` : '';
}
