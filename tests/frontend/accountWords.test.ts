/** The account section on You: the languages as rows, and deleting as two taps, never one. */
import { describe, expect, it } from 'vitest';
import { languageRows, nextDeleteStep, keepsLine, deleteWarning } from '../../src/pages/money/views/you/accountWords';
const t = (s: string) => s;

describe('the account section', () => {
  it('lists the three languages, each in its own name, with the current one marked', () => {
    const rows = languageRows('pt-BR');
    expect(rows.map((r) => r.code)).toEqual(['en', 'es', 'pt-BR']);
    expect(rows.find((r) => r.current)?.name).toBe('Português (Brasil)');
    expect(rows.filter((r) => r.current)).toHaveLength(1);
  });
  it('deletes on the second tap only, and a cancel closes it', () => {
    expect(nextDeleteStep('closed', 'confirm')).toBe('closed');
    expect(nextDeleteStep('closed', 'open')).toBe('armed');
    expect(nextDeleteStep('armed', 'confirm')).toBe('deleting');
    expect(nextDeleteStep('armed', 'cancel')).toBe('closed');
    expect(nextDeleteStep('deleting', 'open')).toBe('deleting');
  });
  it('says what it keeps and what deleting means, without a model in it', () => {
    expect(keepsLine(t)).toMatch(/Nothing is used to train a model/);
    expect(deleteWarning(t)).toMatch(/no way back/);
  });
});
