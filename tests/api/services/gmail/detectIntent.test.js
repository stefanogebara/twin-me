import { describe, it, expect } from 'vitest';
import { detectGmailIntent } from '../../../../api/services/gmail/detectIntent.js';

describe('detectGmailIntent', () => {
  it('returns null for empty', () => expect(detectGmailIntent('').kind).toBeNull());
  it('matches "how many emails this week" → behavior', () =>
    expect(detectGmailIntent('how many emails did I send this week').kind).toBe('behavior'));
  it('matches "who do I email most" → behavior', () =>
    expect(detectGmailIntent('who do I email the most').kind).toBe('behavior'));
  it('matches "my email patterns" → behavior', () =>
    expect(detectGmailIntent('what are my email patterns').kind).toBe('behavior'));
  it('matches "am I a night owl" → behavior', () =>
    expect(detectGmailIntent('am I a night owl based on my email times').kind).toBe('behavior'));
  it('matches "top correspondents" → behavior', () =>
    expect(detectGmailIntent('show me my top email correspondents').kind).toBe('behavior'));
  it('matches plain "gmail" → snapshot', () =>
    expect(detectGmailIntent('check gmail').kind).toBe('snapshot'));
  it('null for non-email question', () =>
    expect(detectGmailIntent('what color is the sky').kind).toBeNull());
});
