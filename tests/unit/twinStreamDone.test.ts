import { describe, it, expect } from 'vitest';
import { resolveStreamDone } from '@/lib/twinStreamDone';

describe('resolveStreamDone (audit High #8 empty-completion guard)', () => {
  it('noop when a chunk already rendered the bubble', () => {
    expect(resolveStreamDone(false, 'anything')).toEqual({ kind: 'noop' });
    expect(resolveStreamDone(false, '')).toEqual({ kind: 'noop' });
  });

  it('renders the trimmed done-payload message when no chunk arrived', () => {
    expect(resolveStreamDone(true, '  hey, here it is  ')).toEqual({ kind: 'render', content: 'hey, here it is' });
  });

  it('errors when no chunk arrived and the message is empty/blank', () => {
    expect(resolveStreamDone(true, '   ')).toEqual({ kind: 'error' });
    expect(resolveStreamDone(true, '')).toEqual({ kind: 'error' });
  });

  it('errors when no chunk arrived and the message is missing/non-string', () => {
    expect(resolveStreamDone(true, undefined)).toEqual({ kind: 'error' });
    expect(resolveStreamDone(true, null)).toEqual({ kind: 'error' });
    expect(resolveStreamDone(true, 42)).toEqual({ kind: 'error' });
  });
});
