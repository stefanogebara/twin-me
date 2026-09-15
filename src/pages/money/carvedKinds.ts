/**
 * Which mark and which ground each kind of place or fact takes. Kept apart from the
 * components so fast refresh keeps working.
 */
/** Which mark a kind of place or a fact takes; a kind with no mark gets no picture. */
export const MARK_BY_KIND: Record<string, string> = {
  groceries: 'groceries', 'eating out': 'eating_out', coffee: 'coffee', transport: 'transport', taxi: 'taxi', fuel: 'transport',
  rent: 'rent', home: 'rent', software: 'software', electronics: 'software', education: 'software',
  sport: 'sport', health: 'pharmacy', pharmacy: 'pharmacy', cash: 'cash', fees: 'cash', bills: 'cash',
  transfers: 'transfer', entertainment: 'entertainment', bar: 'bar', travel: 'transport', lodging: 'rent',
  keep: 'keep', diary: 'diary', income: 'cash', person: 'transfer', commitment: 'rent', cap: 'eating_out', split: 'transfer', note: 'diary', calendar: 'diary',
};

/** The ground a kind takes: the signature it belongs to, at low strength; neutral where none fits. */
export const GROUND_BY_KIND: Record<string, 'ember' | 'verdigris' | 'periwinkle' | 'iris' | 'orchid' | 'none'> = {
  'eating out': 'ember', coffee: 'ember', entertainment: 'ember', bar: 'ember', cap: 'ember', keep: 'ember',
  groceries: 'verdigris', health: 'verdigris', pharmacy: 'verdigris', sport: 'verdigris',
  transport: 'periwinkle', taxi: 'periwinkle', travel: 'periwinkle', fuel: 'periwinkle', diary: 'periwinkle', calendar: 'periwinkle',
  software: 'iris', electronics: 'iris', education: 'iris', note: 'iris',
  transfers: 'orchid', person: 'orchid', rent: 'orchid', home: 'orchid', lodging: 'orchid', commitment: 'orchid', split: 'orchid', income: 'orchid',
};

export function markFor(kind: string | null | undefined): string | null {
  return kind ? MARK_BY_KIND[kind] || null : null;
}
