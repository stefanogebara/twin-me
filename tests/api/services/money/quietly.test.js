/** A quiet failure keeps its name: logged with it, counted under it, the fallback returned. */
import { describe, expect, it, vi } from 'vitest';
const logged = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('../../../../api/_app/services/logger.js', () => ({ createLogger: () => ({ warn: logged.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }) }));
import { quietly, quietFailures, resetQuietFailures } from '../../../../api/_app/services/money/quietly.js';

describe('quietly', () => {
  it('returns the fallback, a fresh one each time when it is made, and counts by name', async () => {
    resetQuietFailures();
    const a = await Promise.reject(new Error('down')).catch(quietly('facts', () => []));
    const b = await Promise.reject(new Error('down')).catch(quietly('facts', () => []));
    expect(a).toEqual([]); expect(a).not.toBe(b);
    expect(await Promise.reject(new Error('x')).catch(quietly('forecast', null))).toBeNull();
    expect(quietFailures()).toEqual({ facts: 2, forecast: 1 });
    expect(logged.warn).toHaveBeenCalledWith('quiet failure: facts', { error: 'down' });
  });
  it('refuses to be anonymous', () => {
    expect(() => quietly('')).toThrow('needs a name');
  });
});
