/**
 * Auto-pagination for Whoop collection endpoints.
 *
 * Follows the `next_token` cursor across multiple pages with safety
 * guards: hard cap on total records (ABSOLUTE_MAX_RECORDS = 500), a
 * configurable per-call cap, max page count, inter-page delay (rate
 * limit friendliness), and optional AbortSignal.
 *
 * The analytics modules in `analytics/` all rely on this — it's the
 * single seam between "give me records for this period" and the actual
 * HTTP transport.
 *
 * Ported from shashankswe2020-ux/whoop-mcp (MIT, Copyright (c) 2025 Shashank Mishra).
 * Original: src/api/pagination.ts. Logic preserved; types stripped.
 */

export const ABSOLUTE_MAX_RECORDS = 500;
const DEFAULT_MAX_RECORDS = 100;
const DEFAULT_MAX_PAGES = 20;
const DEFAULT_INTER_PAGE_DELAY_MS = 200;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendNextToken(path, nextToken) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}nextToken=${encodeURIComponent(nextToken)}`;
}

/**
 * Fetch all pages from a paginated Whoop endpoint.
 *
 * @param {{ get: (path: string) => Promise<{ records: any[], next_token?: string }> }} client
 * @param {string} path  Endpoint path with query string.
 * @param {{
 *   maxRecords?: number,
 *   maxPages?: number,
 *   interPageDelayMs?: number,
 *   signal?: AbortSignal,
 * }} [options]
 * @returns {Promise<{ records: any[], truncated: boolean }>}
 */
export async function fetchAllPages(client, path, options = {}) {
  const maxRecords = Math.min(options.maxRecords ?? DEFAULT_MAX_RECORDS, ABSOLUTE_MAX_RECORDS);
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const interPageDelayMs = options.interPageDelayMs ?? DEFAULT_INTER_PAGE_DELAY_MS;
  const signal = options.signal;

  const allRecords = [];
  let currentPath = path;
  let pagesFetched = 0;

  while (pagesFetched < maxPages) {
    // Honour abort between pages, not on first fetch (we want at least one try).
    if (pagesFetched > 0 && signal?.aborted) {
      return { records: allRecords, truncated: true };
    }
    if (pagesFetched > 0 && interPageDelayMs > 0) {
      await delay(interPageDelayMs);
    }

    const response = await client.get(currentPath);
    pagesFetched++;

    const remaining = maxRecords - allRecords.length;
    if (response.records.length <= remaining) {
      allRecords.push(...response.records);
    } else {
      // Hit the cap mid-page; trim and report truncated.
      allRecords.push(...response.records.slice(0, remaining));
      return { records: allRecords, truncated: true };
    }

    if (allRecords.length >= maxRecords) {
      const truncated = response.next_token !== undefined;
      return { records: allRecords, truncated };
    }

    if (!response.next_token) {
      return { records: allRecords, truncated: false };
    }

    if (signal?.aborted) {
      return { records: allRecords, truncated: true };
    }

    currentPath = appendNextToken(path, response.next_token);
  }

  // Bailed on page-count cap.
  return { records: allRecords, truncated: true };
}
