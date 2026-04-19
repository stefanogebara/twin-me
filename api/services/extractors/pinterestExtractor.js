/**
 * Pinterest Data Extractor (v5)
 *
 * Pulls a user's boards and pins and turns them into natural-language
 * observations stored in the memory stream. Pinterest boards are an
 * underrated taste fingerprint — aesthetic identity, aspirational
 * lifestyle, DIY, travel, fashion. Board names + pin source URLs give
 * rich signal without needing image processing.
 *
 * Auth model: v5 Bearer tokens, 30-day access / 365-day refresh.
 * API docs: https://developers.pinterest.com/docs/api/v5/
 */

import { supabaseAdmin } from '../database.js';
import { decryptToken } from '../encryption.js';
import { addPlatformObservation } from '../memoryStreamService.js';
import { createLogger } from '../logger.js';

const log = createLogger('PinterestExtractor');

// Use sandbox for dev; production is https://api.pinterest.com/v5
const PINTEREST_API_BASE = process.env.PINTEREST_USE_PRODUCTION === 'true'
  ? 'https://api.pinterest.com/v5'
  : 'https://api-sandbox.pinterest.com/v5';

// Limits — keep import under Vercel 60s maxDuration
const MAX_BOARDS = 20;
const MAX_PINS_PER_BOARD = 100;
const MAX_TOTAL_PINS = 200;
const MAX_OBSERVATION_CHARS = 500;

class PinterestExtractor {
  constructor(userId) {
    this.userId = userId;
    this.accessToken = null;
  }

  async loadToken() {
    const { data, error } = await supabaseAdmin
      .from('platform_connections')
      .select('access_token')
      .eq('user_id', this.userId)
      .eq('platform', 'pinterest')
      .single();

    if (error || !data?.access_token) {
      throw new Error('No Pinterest connection found for user');
    }

    this.accessToken = decryptToken(data.access_token);
  }

  async makeRequest(endpoint, { params = null } = {}) {
    if (!this.accessToken) throw new Error('Pinterest access token not loaded');

    let url = `${PINTEREST_API_BASE}${endpoint}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += `?${qs}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Pinterest API GET ${endpoint} failed (${response.status}): ${errText}`);
    }

    return response.json();
  }

  async fetchBoards() {
    const result = await this.makeRequest('/boards', { params: { page_size: String(MAX_BOARDS) } });
    return result.items || [];
  }

  async fetchBoardPins(boardId) {
    const result = await this.makeRequest(`/boards/${boardId}/pins`, {
      params: { page_size: String(MAX_PINS_PER_BOARD) },
    });
    return result.items || [];
  }

  /**
   * Main entry point — extract all reachable Pinterest content.
   */
  async extractAll(userId, _connectorId) {
    log.info('Starting Pinterest extraction', { userId });
    await this.loadToken();

    let boardsProcessed = 0;
    let observationsStored = 0;
    let totalPinsSeen = 0;

    let boards = [];
    try {
      boards = await this.fetchBoards();
      log.info('Found Pinterest boards', { count: boards.length });
    } catch (err) {
      log.error('Pinterest board fetch failed', { error: err.message });
      return { success: false, error: err.message, itemsExtracted: 0 };
    }

    for (const board of boards.slice(0, MAX_BOARDS)) {
      const boardName = board.name || '(Untitled board)';
      const boardDesc = (board.description || '').trim();
      const pinCount = board.pin_count ?? null;

      // Per-board observation
      try {
        let boardObs = `You have a Pinterest board named "${boardName}"`;
        if (pinCount != null) boardObs += ` with ${pinCount} pins`;
        if (boardDesc) boardObs += ` — description: ${boardDesc}`;
        const content = boardObs.slice(0, MAX_OBSERVATION_CHARS);
        const ok = await addPlatformObservation(userId, content, 'pinterest', {
          ingestion_source: 'pinterest_board',
          board_id: board.id,
          board_name: boardName,
          pin_count: pinCount,
        });
        if (ok) observationsStored++;
        boardsProcessed++;
      } catch (err) {
        log.warn('Failed to store board observation', { boardId: board.id, error: err.message });
      }

      // Fetch pins for this board — bail out once we hit the global cap
      if (totalPinsSeen >= MAX_TOTAL_PINS) continue;

      let pins = [];
      try {
        pins = await this.fetchBoardPins(board.id);
      } catch (err) {
        log.warn('Failed to fetch pins for board', { boardId: board.id, error: err.message });
        continue;
      }

      for (const pin of pins) {
        if (totalPinsSeen >= MAX_TOTAL_PINS) break;
        totalPinsSeen++;

        const pinTitle = (pin.title || '').trim();
        const pinDesc = (pin.description || '').trim();
        const pinLink = pin.link || '';

        // Skip pins with no signal at all
        if (!pinTitle && !pinDesc && !pinLink) continue;

        let pinObs = `On your "${boardName}" board you pinned`;
        if (pinTitle) pinObs += `: "${pinTitle}"`;
        if (pinDesc) pinObs += ` — ${pinDesc}`;
        if (pinLink) pinObs += `. Source: ${pinLink}`;

        const content = pinObs.slice(0, MAX_OBSERVATION_CHARS);
        try {
          const ok = await addPlatformObservation(userId, content, 'pinterest', {
            ingestion_source: 'pinterest_pin',
            board_id: board.id,
            board_name: boardName,
            pin_id: pin.id,
            pin_link: pinLink || null,
            created_at: pin.created_at || null,
          });
          if (ok) observationsStored++;
        } catch (err) {
          log.warn('Failed to store pin observation', { pinId: pin.id, error: err.message });
        }
      }
    }

    log.info('Pinterest extraction complete', {
      userId,
      boardsProcessed,
      totalPinsSeen,
      observationsStored,
    });

    return {
      success: true,
      itemsExtracted: observationsStored,
      boardsProcessed,
    };
  }
}

export async function extractAll(userId, connectorId) {
  const extractor = new PinterestExtractor(userId);
  return extractor.extractAll(userId, connectorId);
}

export default PinterestExtractor;
