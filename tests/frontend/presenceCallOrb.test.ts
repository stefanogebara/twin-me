/**
 * Which orb her call page shows, and when it shows none.
 *
 * The orb has one meaning everywhere (LedgerOrb): something is happening right now.
 * On her page that is the presence waiting for her, connecting, listening, talking,
 * or keeping the conversation. Once nothing is happening, there is no orb.
 */
import { describe, it, expect } from 'vitest';
import { orbFor } from '../../src/pages/presence/callOrb';

describe('orbFor', () => {
  it('breathes while the page loads and while it waits for her to start', () => {
    expect(orbFor('loading', 'idle')).toEqual({ state: 'breathing', size: 64, speed: 1 });
    expect(orbFor('ready', 'idle')).toEqual({ state: 'breathing', size: 128, speed: 1 });
  });

  it('shows the connection being made', () => {
    expect(orbFor('connecting', 'idle')).toMatchObject({ state: 'connecting', size: 128 });
  });

  it('listens when she talks, composes when it talks back, breathes in the pauses', () => {
    expect(orbFor('live', 'listening')).toMatchObject({ state: 'listening', speed: 1 });
    expect(orbFor('live', 'speaking')).toMatchObject({ state: 'composing', speed: 1.3 });
    expect(orbFor('live', 'idle')).toMatchObject({ state: 'breathing', speed: 1 });
  });

  it('works while the conversation is being kept', () => {
    expect(orbFor('saving', 'idle')).toMatchObject({ state: 'working', size: 64 });
  });

  it('shows nothing once nothing is happening', () => {
    for (const s of ['done', 'lost', 'invalid', 'error'] as const) expect(orbFor(s, 'idle')).toBeNull();
  });
});

describe('orbFor when the channel did not answer', () => {
  it('shows nothing while she is asked to try again', () => {
    expect(orbFor('unavailable', 'idle')).toBeNull();
  });
});
