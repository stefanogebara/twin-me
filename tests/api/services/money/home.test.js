/**
 * The home lens is deterministic: the same everyday shops must always give the same guess,
 * the guess must never be an outlier, and what it keeps must be what every other reader of
 * facts expects (words), with the point hidden.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const upserts = [];
vi.mock('../../../../api/services/database.js', () => ({
  supabaseAdmin: {
    from: (table) => ({
      upsert: (row, opts) => { upserts.push({ table, row, opts }); return Promise.resolve({ error: null }); },
      select: () => ({ in: () => Promise.resolve({ data: [] }) }),
    }),
  },
}));
vi.mock('../../../../api/services/logger.js', () => ({ createLogger: () => ({ warn() {}, info() {}, error() {}, debug() {} }) }));
const store = { listTransactions: vi.fn(async () => []), listFacts: vi.fn(async () => []) };
vi.mock('../../../../api/services/money/store.js', () => store);

const home = await import('../../../../api/services/money/home.js');
const { describeContext } = await import('../../../../api/services/money/context.js');
const {
  weighPlaces, clusterHome, circlePolygon, filterAreas, staticMapUrl, pickDistrict, saveHome, savedHome, homeValue, distanceM,
  RING_POINTS, CLUSTER_RADIUS_M,
} = home;

const NOW = new Date('2026-09-08T12:00:00Z');
const place = (merchant_key, lat, lon, category, name = merchant_key) => ({ merchant_key, name, lat, lon, category, category_override: null });
const pay = (merchant_key, day, amount = -12) => ({ merchant_key, amount, occurred_at: `2026-08-${String(day).padStart(2, '0')}T18:00:00Z` });

/* Chamberi: a supermarket, a pharmacy and a metro within a few hundred metres. One
   supermarket in Alcobendas, 15 km north, paid at once. */
const places = [
  place('mercadona chamberi', 40.4340, -3.7040, 'groceries', 'Mercadona'),
  place('farmacia luchana', 40.4352, -3.7025, 'pharmacy', 'Farmacia Luchana'),
  place('metro bilbao', 40.4335, -3.7010, 'transport', 'Metro Bilbao'),
  place('la tasca', 40.4345, -3.7050, 'eating out', 'La Tasca'),
  place('mercadona alcobendas', 40.5470, -3.6420, 'groceries', 'Mercadona Alcobendas'),
  place('bolt', 40.4200, -3.7000, 'taxi', 'Bolt'),
];
const payments = [
  pay('mercadona chamberi', 1), pay('mercadona chamberi', 4), pay('mercadona chamberi', 11), pay('mercadona chamberi', 18),
  pay('farmacia luchana', 5), pay('farmacia luchana', 20),
  pay('metro bilbao', 2), pay('metro bilbao', 3), pay('metro bilbao', 9),
  pay('la tasca', 6), pay('la tasca', 13), pay('la tasca', 27),
  pay('mercadona alcobendas', 15, -80),
  pay('bolt', 8), pay('bolt', 9), pay('bolt', 10),
];

describe('weighing places', () => {
  it('counts distinct days at everyday places, lets a restaurant in only as a habit, and drops taxis', () => {
    const w = weighPlaces(payments, places, { now: NOW });
    const byKey = Object.fromEntries(w.map((p) => [p.merchant_key, p.weight]));
    expect(byKey['mercadona chamberi']).toBe(4);
    expect(byKey['metro bilbao']).toBe(3);
    expect(byKey['la tasca']).toBe(3);
    expect(byKey.bolt).toBeUndefined();
  });

  it('drops a restaurant paid at twice: not yet a habit', () => {
    const twice = payments.filter((p) => !(p.merchant_key === 'la tasca' && p.occurred_at.includes('-27')));
    const w = weighPlaces(twice, places, { now: NOW });
    expect(w.some((p) => p.merchant_key === 'la tasca')).toBe(false);
  });

  it('ignores payments older than the lookback and places without a point', () => {
    const old = [{ merchant_key: 'mercadona chamberi', amount: -10, occurred_at: '2026-01-05T10:00:00Z' }];
    expect(weighPlaces(old, places, { now: NOW })).toEqual([]);
    const noPoint = [place('ghost', null, null, 'groceries')];
    expect(weighPlaces([pay('ghost', 2)], noPoint, { now: NOW })).toEqual([]);
  });
});

describe('the cluster', () => {
  it('picks the dense neighbourhood and not the one-off supermarket 15 km away', () => {
    const c = clusterHome(weighPlaces(payments, places, { now: NOW }));
    expect(c).not.toBeNull();
    expect(distanceM(c, { lat: 40.4343, lng: -3.7031 })).toBeLessThan(300);
    expect(distanceM(c, { lat: 40.5470, lng: -3.6420 })).toBeGreaterThan(10000);
    expect(c.confidence).toBe('good');
    expect(c.places.map((p) => p.merchant_key)).not.toContain('mercadona alcobendas');
    expect(c.basis).toBe(`12 paid days at 4 everyday shops within ${CLUSTER_RADIUS_M} m of here`);
  });

  it('is weak with two places, and null with one', () => {
    const two = weighPlaces([pay('mercadona chamberi', 1), pay('metro bilbao', 2)], places, { now: NOW });
    expect(clusterHome(two).confidence).toBe('weak');
    const one = weighPlaces([pay('mercadona chamberi', 1), pay('mercadona chamberi', 2)], places, { now: NOW });
    expect(clusterHome(one)).toBeNull();
  });

  it('is weak when the neighbourhood holds less than half the paid days', () => {
    const spread = [
      pay('mercadona chamberi', 1), pay('metro bilbao', 2), pay('farmacia luchana', 3),
      pay('mercadona alcobendas', 4), pay('mercadona alcobendas', 5), pay('mercadona alcobendas', 6), pay('mercadona alcobendas', 7),
    ];
    const c = clusterHome(weighPlaces(spread, places, { now: NOW }));
    expect(c.confidence).toBe('weak');
  });
});

describe('the map', () => {
  it('draws a closed ring of thirty-six points, in ink, without a marker', () => {
    const ring = circlePolygon({ lat: 40.4343, lng: -3.7031 });
    expect(ring).toHaveLength(RING_POINTS + 1);
    expect(ring[0]).toEqual(ring[RING_POINTS]);
    for (const p of ring.slice(0, RING_POINTS)) {
      const d = distanceM({ lat: 40.4343, lng: -3.7031 }, p);
      expect(Math.abs(d - 600)).toBeLessThan(15);
    }
    const url = staticMapUrl({ lat: 40.4343, lng: -3.7031 }, 'k');
    expect(url).toContain('path=color%3A0x111111aa%7Cweight%3A2%7C');
    expect(url).not.toContain('markers');
    expect(url).toContain('saturation%3A-100');
    expect(url).toContain('feature%3Apoi%7Celement%3Alabels%7Cvisibility%3Aoff');
    expect(url).toContain('key=k');
  });
});

describe('naming and searching', () => {
  it('reads the district and city out of a geocoding answer', () => {
    const data = { results: [{ address_components: [
      { long_name: 'Calle de Luchana', types: ['route'] },
      { long_name: 'Chamberi', types: ['sublocality_level_1', 'sublocality', 'political'] },
      { long_name: 'Madrid', types: ['locality', 'political'] },
    ] }] };
    expect(pickDistrict(data)).toEqual({ district: 'Chamberi', city: 'Madrid' });
    expect(pickDistrict(null)).toEqual({ district: null, city: null });
  });

  it('keeps districts and towns, drops shops, strips the country, stops at six', () => {
    const mk = (name, types, addr = `${name}, Madrid, Espana`) => ({ id: name, displayName: { text: name }, formattedAddress: addr, location: { latitude: 40.4, longitude: -3.7 }, types });
    const results = filterAreas([
      mk('Chamberi', ['sublocality_level_1', 'political']),
      mk('Mercadona', ['supermarket', 'store']),
      mk('Alcobendas', ['locality', 'political'], 'Alcobendas, Espana'),
      mk('Malasana', ['neighborhood']), mk('Lavapies', ['neighborhood']), mk('Salamanca', ['sublocality']),
      mk('Retiro', ['sublocality']), mk('Tetuan', ['sublocality']),
    ]);
    expect(results.map((r) => r.label)).toEqual(['Chamberi', 'Alcobendas', 'Malasana', 'Lavapies', 'Salamanca', 'Retiro']);
    expect(results[0].secondary).toBe('Chamberi, Madrid');
    expect(results[1].secondary).toBe('');
  });
});

describe('keeping a home', () => {
  beforeEach(() => { upserts.length = 0; });

  it('writes the words other readers expect, hides the point, and marks the question answered', async () => {
    const out = await saveHome('u1', { district: 'Chamberi', city: 'Madrid', lat: 40.4343, lng: -3.7031, source: 'confirmed' });
    const area = upserts.find((u) => u.table === 'money_facts' && u.row.kind === 'home_area');
    const point = upserts.find((u) => u.table === 'money_facts' && u.row.kind === 'home_point');
    const asked = upserts.find((u) => u.table === 'money_questions_asked');
    expect(area.row.value).toBe('Chamberi, Madrid');
    expect(area.row.source).toBe('asked');
    expect(area.opts).toEqual({ onConflict: 'user_id,kind,subject' });
    expect(JSON.parse(point.row.value)).toMatchObject({ lat: 40.4343, lng: -3.7031, district: 'Chamberi' });
    expect(asked.row).toMatchObject({ question_id: 'home_area', answered: true });
    expect(describeContext([area.row])).toContain('Lives in Chamberi, Madrid.');
    expect(out.said).toBe('Lives in Chamberi, Madrid. The shops around it read as near home now.');
  });

  it('does not repeat the city when it is the district, and refuses an empty home', async () => {
    expect(homeValue({ district: 'Alcobendas', city: 'Alcobendas' })).toBe('Alcobendas');
    expect(homeValue({ district: '', city: 'Madrid' })).toBe('Madrid');
    await expect(saveHome('u1', { district: '', city: '' })).rejects.toThrow();
  });

  it('reads back the point behind the words', async () => {
    store.listFacts.mockResolvedValueOnce([
      { kind: 'home_area', value: 'Chamberi, Madrid', source: 'asked' },
      { kind: 'home_point', value: JSON.stringify({ lat: 40.4343, lng: -3.7031, district: 'Chamberi', city: 'Madrid', source: 'confirmed' }) },
    ]);
    const saved = await savedHome('u1');
    expect(saved).toMatchObject({ district: 'Chamberi', city: 'Madrid', lat: 40.4343, lng: -3.7031, value: 'Chamberi, Madrid' });
    expect(store.listFacts).toHaveBeenCalledWith('u1', { includeInternal: true });
  });
});
