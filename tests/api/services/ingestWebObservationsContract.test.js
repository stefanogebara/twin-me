/**
 * Contract test for ingestWebObservations → addPlatformObservation.
 *
 * Pinned bug (2026-06-06): the call site at line 256 of
 * observationIngestion.js was passing the metadata object as the
 * `platform` argument. addPlatformObservation's signature is
 * (userId, content, platform, metadata={}). The misalignment meant
 * every browser-extension observation landed with metadata.source =
 * { source: 'browser_extension', platform: 'web', data_type: ... }
 * instead of the expected 'browser_extension' string — invisible to
 * any filter like .eq('metadata->>source', 'browser_extension').
 *
 * This test locks the contract: spy on addPlatformObservation, push a
 * representative tab_visit through ingestWebObservations, and assert
 * that arg[2] is exactly the string 'web' and arg[3] is an object
 * carrying source:'browser_extension'. If the signature regresses, the
 * test fails loudly instead of producing malformed memories silently.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const memoryStreamMock = vi.hoisted(() => ({
  addPlatformObservation: vi.fn().mockResolvedValue({ id: 'memory-id' }),
}));

vi.mock('../../../api/services/memoryStreamService.js', () => memoryStreamMock);

const dedupMock = vi.hoisted(() => ({
  isDuplicate: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../api/services/observationUtils.js', async () => {
  const actual = await vi.importActual('../../../api/services/observationUtils.js');
  return { ...actual, isDuplicate: dedupMock.isDuplicate };
});

// Import AFTER the mocks so the function picks up the spies.
const { ingestWebObservations } = await import('../../../api/services/observationIngestion.js');

beforeEach(() => {
  memoryStreamMock.addPlatformObservation.mockClear();
  dedupMock.isDuplicate.mockClear();
});

describe('ingestWebObservations → addPlatformObservation contract', () => {
  it('passes platform as a STRING (not an object) and metadata as the 4th arg', async () => {
    const count = await ingestWebObservations('user-1', [
      {
        data_type: 'extension_page_visit',
        raw_data: {
          title: 'Opened Discord channel 888 in server 999',
          domain: 'discord.com',
          url: 'https://discord.com/channels/999/888',
          timestamp: new Date().toISOString(),
        },
      },
    ]);

    expect(count).toBe(1);
    expect(memoryStreamMock.addPlatformObservation).toHaveBeenCalledTimes(1);

    const [, , platformArg, metadataArg] =
      memoryStreamMock.addPlatformObservation.mock.calls[0];

    // The actual regression we're pinning: arg[2] must be a string.
    expect(typeof platformArg).toBe('string');
    expect(platformArg).toBe('web');

    // arg[3] must be a flat metadata object with source set to the string.
    expect(metadataArg).toBeTypeOf('object');
    expect(metadataArg).not.toBeNull();
    expect(metadataArg.source).toBe('browser_extension');
    expect(metadataArg.data_type).toBe('extension_page_visit');
  });

  it('produces a "Visited <title>" content string for the generic branch', async () => {
    await ingestWebObservations('user-2', [
      {
        data_type: 'extension_page_visit',
        raw_data: {
          title: 'Spent 12m scrolling LinkedIn feed',
          domain: 'linkedin.com',
          url: 'https://www.linkedin.com/feed/',
          timestamp: new Date().toISOString(),
        },
      },
    ]);

    const [, content] = memoryStreamMock.addPlatformObservation.mock.calls[0];
    expect(content).toBe('Visited Spent 12m scrolling LinkedIn feed.');
  });

  it('skips events that are flagged as duplicates without calling addPlatformObservation', async () => {
    dedupMock.isDuplicate.mockResolvedValueOnce(true);
    const count = await ingestWebObservations('user-3', [
      {
        data_type: 'extension_page_visit',
        raw_data: { title: 'Visited Foo', domain: 'foo.com' },
      },
    ]);
    expect(count).toBe(0);
    expect(memoryStreamMock.addPlatformObservation).not.toHaveBeenCalled();
  });
});
