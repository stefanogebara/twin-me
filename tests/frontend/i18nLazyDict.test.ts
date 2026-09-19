/** A dictionary arrives only for the language spoken; English is always here; a line asked
 *  for before its dictionary lands is English, and Spanish once it has (M3-2, 2026-09-19). */
import { describe, expect, it } from 'vitest';
import { dictReady, ensureDict, translate } from '../../src/lib/i18n';

describe('dictionaries on demand', () => {
  it('has English at once and Spanish only after it is asked for', async () => {
    expect(dictReady('en')).toBe(true);
    expect(translate('en', 'Today')).toBe('Today');
    const before = dictReady('es');
    if (!before) expect(translate('es', 'Today')).toBe('Today');
    await ensureDict('es');
    expect(dictReady('es')).toBe(true);
    expect(translate('es', 'Today')).toBe('Hoy');
    await expect(ensureDict('es')).resolves.toBeUndefined();
  });
});
