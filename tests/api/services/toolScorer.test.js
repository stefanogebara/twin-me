/**
 * Characterization tests for the tool relevance scorer used by contextRouter to
 * cut 37+ tools down to the most relevant 5-8. Pure keyword/category/name-overlap
 * math plus deterministic ranking with fallbacks. No I/O.
 */
import { describe, it, expect } from 'vitest';
import {
  scoreToolRelevance,
  scoreAndRankTools,
  PLATFORM_KEYWORDS,
  CATEGORY_KEYWORDS,
} from '../../../api/services/toolScorer.js';

const spotifyTool = { name: 'get_music', platform: 'spotify', category: 'music', description: 'fetch listening data' };
const memoryTool = { name: 'search_memory', platform: null, category: 'memory', description: 'recall past facts' };
const calendarTool = { name: 'get_events', platform: 'google_calendar', category: 'schedule', description: 'calendar events' };

describe('scoreToolRelevance', () => {
  it('returns 0 for missing tool or empty task', () => {
    expect(scoreToolRelevance(null, 'play music')).toBe(0);
    expect(scoreToolRelevance(spotifyTool, '')).toBe(0);
    expect(scoreToolRelevance(spotifyTool, null)).toBe(0);
  });

  it('gives a high score when the task hits the platform keywords', () => {
    // "music" + "song" + "playlist" are all spotify platform keywords -> caps at 0.5
    const score = scoreToolRelevance(
      { name: 'x', platform: 'spotify' },
      'play me a song from my music playlist',
    );
    expect(score).toBeGreaterThanOrEqual(0.5);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('caps the platform contribution at 0.5 even with many matches', () => {
    // platform-only tool, many spotify words -> exactly the 0.5 cap
    const score = scoreToolRelevance(
      { name: 'zzz', platform: 'spotify', description: '' },
      'music song playlist track artist album genre spotify',
    );
    expect(score).toBe(0.5);
  });

  it('adds category points on top of platform (max 0.3 for category)', () => {
    const platformOnly = scoreToolRelevance({ name: 'a', platform: 'spotify' }, 'song playlist');
    const withCategory = scoreToolRelevance(
      { name: 'a', platform: 'spotify', category: 'music' },
      'song playlist',
    );
    expect(withCategory).toBeGreaterThan(platformOnly);
  });

  it('rewards direct name/description token overlap (>=3 chars)', () => {
    const score = scoreToolRelevance(
      { name: 'calendar', platform: null, description: 'meeting scheduler' },
      'show my calendar meeting',
    );
    expect(score).toBeGreaterThan(0);
  });

  it('never exceeds 1.0', () => {
    const score = scoreToolRelevance(
      { name: 'music song', platform: 'spotify', category: 'music', description: 'music song playlist track' },
      'music song playlist track artist album genre spotify listen tune beats',
    );
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('scores an unrelated task near zero', () => {
    const score = scoreToolRelevance(
      { name: 'get_music', platform: 'spotify', category: 'music', description: 'listening data' },
      'what is the capital of France',
    );
    expect(score).toBe(0);
  });
});

describe('scoreAndRankTools', () => {
  it('returns [] for empty tool list', () => {
    expect(scoreAndRankTools([], 'anything')).toEqual([]);
    expect(scoreAndRankTools(null, 'anything')).toEqual([]);
  });

  it('returns the first topK tools unscored when no task description', () => {
    const tools = [spotifyTool, memoryTool, calendarTool];
    const result = scoreAndRankTools(tools, '', 2);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(spotifyTool);
  });

  it('sorts by relevance descending and attaches relevanceScore', () => {
    const tools = [calendarTool, spotifyTool, memoryTool];
    const result = scoreAndRankTools(tools, 'play my favorite song and playlist', 8);
    expect(result[0].name).toBe('get_music'); // spotify tool wins on music task
    expect(result[0]).toHaveProperty('relevanceScore');
    expect(result[0].relevanceScore).toBeGreaterThan(0);
  });

  it('respects the topK cap', () => {
    const tools = [
      { name: 'a', platform: 'spotify', category: 'music', description: 'song' },
      { name: 'b', platform: 'spotify', category: 'music', description: 'track' },
      { name: 'c', platform: 'spotify', category: 'music', description: 'album' },
    ];
    const result = scoreAndRankTools(tools, 'song track album music', 2);
    expect(result).toHaveLength(2);
  });

  it('includes memory tools (score 0.05) to fill slots when they would otherwise be excluded', () => {
    const tools = [
      { name: 'get_music', platform: 'spotify', category: 'music', description: 'song' },
      { name: 'search_memory', platform: null, category: 'memory', description: 'recall' },
    ];
    // task only matches music; memory has score 0 but should be filled in as always-useful
    const result = scoreAndRankTools(tools, 'play a song', 8);
    const mem = result.find(t => t.name === 'search_memory');
    expect(mem).toBeDefined();
    expect(mem.relevanceScore).toBe(0.05);
  });

  it('when nothing scores but a memory tool exists, pass 2 fills it at 0.05 (fallback branch not reached)', () => {
    // The memory-inclusion second pass runs BEFORE the results.length===0
    // fallback, so a present memory tool short-circuits the 0.1 fallback.
    const tools = [
      { name: 'get_platform_data', platform: null, category: 'data', description: 'raw data' },
      { name: 'search_memory', platform: null, category: 'memory', description: 'recall' },
      { name: 'get_music', platform: 'spotify', category: 'music', description: 'song' },
    ];
    const result = scoreAndRankTools(tools, 'xyzzy plugh nothing matches here', 8);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('search_memory');
    expect(result[0].relevanceScore).toBe(0.05);
  });

  it('reaches the 0.1 fallback only when no tool scores AND no memory tool exists', () => {
    // No memory-category tool -> pass 2 adds nothing -> results stays empty ->
    // final fallback returns get_platform_data (+ memory) at 0.1.
    const tools = [
      { name: 'get_platform_data', platform: null, category: 'data', description: 'raw data' },
      { name: 'get_music', platform: 'spotify', category: 'music', description: 'song' },
    ];
    const result = scoreAndRankTools(tools, 'xyzzy plugh nothing matches here', 8);
    expect(result.length).toBeGreaterThan(0);
    for (const t of result) expect(t.relevanceScore).toBe(0.1);
    expect(result.map(t => t.name)).toContain('get_platform_data');
  });
});

describe('keyword map exports (shape guard)', () => {
  it('exposes platform + category keyword dictionaries', () => {
    expect(PLATFORM_KEYWORDS.spotify).toContain('music');
    expect(PLATFORM_KEYWORDS.whoop).toContain('recovery');
    expect(CATEGORY_KEYWORDS.memory).toContain('remember');
    expect(CATEGORY_KEYWORDS.health).toContain('sleep');
  });
});
