import { describe, it, expect } from 'vitest';
import {
  FETCH_ERROR_MESSAGE,
  dropTrailingErrorBubble,
} from '@/pages/onboarding/components/deepInterviewHelpers';

// Contract: when a calibration fetch fails, DeepInterview shows a "Try again"
// button whose handler refetches from the conversation history with the error
// bubble removed — so the error text never re-enters the history sent to the
// model, and the first-question (empty history) failure recovers cleanly.
describe('DeepInterview retry helper', () => {
  it('strips a trailing error bubble before refetch', () => {
    const msgs = [
      { role: 'assistant', content: 'Q1' },
      { role: 'user', content: 'A1' },
      { role: 'assistant', content: FETCH_ERROR_MESSAGE },
    ];
    expect(dropTrailingErrorBubble(msgs)).toEqual([
      { role: 'assistant', content: 'Q1' },
      { role: 'user', content: 'A1' },
    ]);
  });

  it('leaves history untouched when the last message is a real turn', () => {
    const msgs = [
      { role: 'assistant', content: 'Q1' },
      { role: 'user', content: 'A1' },
    ];
    expect(dropTrailingErrorBubble(msgs)).toEqual(msgs);
  });

  it('handles empty history (first-question failure) without throwing', () => {
    expect(dropTrailingErrorBubble([])).toEqual([]);
  });

  it('does not strip a real assistant turn that merely resembles an error', () => {
    const msgs = [{ role: 'assistant', content: 'Something went wrong in your week — tell me about it.' }];
    expect(dropTrailingErrorBubble(msgs)).toEqual(msgs);
  });
});
