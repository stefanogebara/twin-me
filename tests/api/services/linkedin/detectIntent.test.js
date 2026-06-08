import { describe, it, expect } from 'vitest';
import { detectLinkedInIntent } from '../../../../api/services/linkedin/detectIntent.js';

describe('detectLinkedInIntent', () => {
  it('returns null for empty / unrelated', () => {
    expect(detectLinkedInIntent('').kind).toBeNull();
    expect(detectLinkedInIntent('what is the weather').kind).toBeNull();
  });

  it('detects activity on engagement-style questions', () => {
    expect(detectLinkedInIntent('my linkedin activity this week').kind).toBe('activity');
    expect(detectLinkedInIntent('what does my linkedin engagement look like').kind).toBe('activity');
  });

  it('detects activity on headline / industry / role questions', () => {
    expect(detectLinkedInIntent("what's my linkedin headline").kind).toBe('activity');
    expect(detectLinkedInIntent("what's my linkedin role").kind).toBe('activity');
  });

  it('falls back to snapshot when only a noun matches', () => {
    expect(detectLinkedInIntent('check linkedin').kind).toBe('snapshot');
    expect(detectLinkedInIntent('network update').kind).toBe('snapshot');
  });
});
