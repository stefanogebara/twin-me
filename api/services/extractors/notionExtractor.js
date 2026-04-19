/**
 * Notion Data Extractor
 *
 * Extracts pages and database rows from a user's Notion workspace and turns
 * them into natural-language observations stored in the memory stream.
 *
 * Notion is the user's self-reflection goldmine — journals, goals, reading
 * lists, life OS pages. The richest authentic self-record available.
 *
 * Auth model: Notion uses Bearer tokens that do NOT expire and CANNOT be
 * refreshed. Users grant per-page/per-database access at auth time via
 * Notion's consent screen (no traditional scopes).
 *
 * API docs: https://developers.notion.com/reference/intro
 */

import { supabaseAdmin } from '../database.js';
import { decryptToken } from '../encryption.js';
import { addPlatformObservation } from '../memoryStreamService.js';
import { createLogger } from '../logger.js';

const log = createLogger('NotionExtractor');

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// Limits — keep import under the Vercel 60s maxDuration
const MAX_PAGES_INITIAL = 50;
const MAX_DATABASES_INITIAL = 10;
const MAX_DB_ROWS_PER_DATABASE = 25;
const MAX_BLOCKS_PER_PAGE = 100;
const MAX_OBSERVATION_CHARS = 500;

// Block types we extract text from, mapped to the property holding rich_text
const TEXT_BLOCK_TYPES = {
  paragraph: 'paragraph',
  heading_1: 'heading_1',
  heading_2: 'heading_2',
  heading_3: 'heading_3',
  bulleted_list_item: 'bulleted_list_item',
  numbered_list_item: 'numbered_list_item',
  to_do: 'to_do',
  callout: 'callout',
  quote: 'quote',
  toggle: 'toggle',
};

class NotionExtractor {
  constructor(userId) {
    this.userId = userId;
    this.accessToken = null;
  }

  async loadToken() {
    const { data, error } = await supabaseAdmin
      .from('platform_connections')
      .select('access_token')
      .eq('user_id', this.userId)
      .eq('platform', 'notion')
      .single();

    if (error || !data?.access_token) {
      throw new Error('No Notion connection found for user');
    }

    this.accessToken = decryptToken(data.access_token);
  }

  /**
   * Authenticated fetch against the Notion API.
   */
  async makeRequest(endpoint, { method = 'GET', body = null, params = null } = {}) {
    if (!this.accessToken) throw new Error('Notion access token not loaded');

    let url = `${NOTION_API_BASE}${endpoint}`;
    if (params && method === 'GET') {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += `?${qs}`;
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Notion API ${method} ${endpoint} failed (${response.status}): ${errText}`);
    }

    return response.json();
  }

  /**
   * Flatten a Notion rich_text array to a plain string.
   */
  richTextToPlain(richText) {
    if (!Array.isArray(richText)) return '';
    return richText.map(rt => rt?.plain_text || '').join('').trim();
  }

  /**
   * Extract page title from a Notion page object.
   */
  getPageTitle(page) {
    // Database rows: properties.<title prop>.title = [{plain_text}]
    if (page?.properties) {
      for (const prop of Object.values(page.properties)) {
        if (prop?.type === 'title' && Array.isArray(prop.title)) {
          const t = this.richTextToPlain(prop.title);
          if (t) return t;
        }
      }
    }
    // Top-level pages: .properties.title or fallback to first heading-like thing
    return '(Untitled)';
  }

  /**
   * Fetch and flatten the text content of a page's blocks (1 level deep).
   */
  async fetchPageText(pageId) {
    const textParts = [];
    try {
      const result = await this.makeRequest(
        `/blocks/${pageId}/children`,
        { method: 'GET', params: { page_size: String(MAX_BLOCKS_PER_PAGE) } }
      );

      for (const block of result.results || []) {
        const type = block.type;
        if (!TEXT_BLOCK_TYPES[type]) continue;
        const payload = block[type];
        if (!payload) continue;
        const text = this.richTextToPlain(payload.rich_text);
        if (text) textParts.push(text);
      }
    } catch (err) {
      log.warn('Failed to fetch blocks for page', { pageId, error: err.message });
    }
    return textParts.join('\n').trim();
  }

  /**
   * Chunk long page text into <=MAX_OBSERVATION_CHARS observation strings,
   * each prefixed with the page title for context.
   */
  buildPageObservations(title, text) {
    if (!text) return [];
    const prefix = `In your Notion page "${title}" you wrote: `;
    const budget = MAX_OBSERVATION_CHARS - prefix.length;
    if (budget <= 50) {
      // Title itself is huge — just store the title as one observation
      return [`${prefix}${text.slice(0, Math.max(50, MAX_OBSERVATION_CHARS - prefix.length))}`];
    }

    const observations = [];
    let remaining = text;
    while (remaining.length > 0 && observations.length < 5) {
      // Cap at 5 chunks per page to avoid one megapage dominating the stream
      const excerpt = remaining.slice(0, budget);
      observations.push(`${prefix}${excerpt}`);
      remaining = remaining.slice(budget);
    }
    return observations;
  }

  /**
   * Search for pages the user has shared with the integration.
   */
  async searchPages() {
    const result = await this.makeRequest('/search', {
      method: 'POST',
      body: {
        filter: { value: 'page', property: 'object' },
        page_size: MAX_PAGES_INITIAL,
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
      },
    });
    return result.results || [];
  }

  /**
   * Search for databases (reading lists, goals, journals) the user shared.
   */
  async searchDatabases() {
    const result = await this.makeRequest('/search', {
      method: 'POST',
      body: {
        filter: { value: 'database', property: 'object' },
        page_size: MAX_DATABASES_INITIAL,
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
      },
    });
    return result.results || [];
  }

  /**
   * Query database rows (each row is itself a page).
   */
  async queryDatabase(databaseId) {
    const result = await this.makeRequest(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: { page_size: MAX_DB_ROWS_PER_DATABASE },
    });
    return result.results || [];
  }

  /**
   * Derive a readable title for a database object.
   */
  getDatabaseTitle(db) {
    if (Array.isArray(db?.title)) {
      const t = this.richTextToPlain(db.title);
      if (t) return t;
    }
    return '(Untitled database)';
  }

  /**
   * Main entry point — extract all reachable Notion content.
   */
  async extractAll(userId, _connectorId) {
    log.info('Starting Notion extraction', { userId });
    await this.loadToken();

    let pagesProcessed = 0;
    let observationsStored = 0;

    // 1. Pages shared with the integration
    let pages = [];
    try {
      pages = await this.searchPages();
      log.info('Found Notion pages', { count: pages.length });
    } catch (err) {
      log.error('Notion page search failed', { error: err.message });
    }

    for (const page of pages.slice(0, MAX_PAGES_INITIAL)) {
      try {
        const title = this.getPageTitle(page);
        const text = await this.fetchPageText(page.id);
        const observations = this.buildPageObservations(title, text);
        for (const content of observations) {
          const ok = await addPlatformObservation(userId, content, 'notion', {
            ingestion_source: 'notion_page',
            page_id: page.id,
            page_url: page.url || null,
            last_edited_time: page.last_edited_time || null,
          });
          if (ok) observationsStored++;
        }
        pagesProcessed++;
      } catch (err) {
        log.warn('Failed to process Notion page', { pageId: page?.id, error: err.message });
      }
    }

    // 2. Databases (reading lists, goals, journals)
    let databases = [];
    try {
      databases = await this.searchDatabases();
      log.info('Found Notion databases', { count: databases.length });
    } catch (err) {
      log.warn('Notion database search failed', { error: err.message });
    }

    for (const db of databases.slice(0, MAX_DATABASES_INITIAL)) {
      try {
        const dbTitle = this.getDatabaseTitle(db);
        const rows = await this.queryDatabase(db.id);
        for (const row of rows) {
          const rowTitle = this.getPageTitle(row);
          // Just the row title (+ db context) as a compact observation — cheap and dense
          const content = `In your Notion database "${dbTitle}" there is an entry: "${rowTitle}"`
            .slice(0, MAX_OBSERVATION_CHARS);
          const ok = await addPlatformObservation(userId, content, 'notion', {
            ingestion_source: 'notion_database_row',
            database_id: db.id,
            page_id: row.id,
            last_edited_time: row.last_edited_time || null,
          });
          if (ok) observationsStored++;
        }
      } catch (err) {
        log.warn('Failed to process Notion database', { dbId: db?.id, error: err.message });
      }
    }

    log.info('Notion extraction complete', {
      userId,
      pagesProcessed,
      observationsStored,
    });

    return {
      success: true,
      itemsExtracted: observationsStored,
      pagesProcessed,
    };
  }
}

/**
 * Orchestrator-compatible entry point.
 */
export async function extractAll(userId, connectorId) {
  const extractor = new NotionExtractor(userId);
  return extractor.extractAll(userId, connectorId);
}

export default NotionExtractor;
