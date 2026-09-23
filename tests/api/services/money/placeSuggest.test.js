/**
 * A place field answers what is being typed, not what has been finished.
 *
 * The lookup used Google's text search, which matches a whole question: typing "Recolet"
 * returned nothing, so the field looked broken until the last letter (Stefano, 2026-09-16).
 * Autocomplete answers a prefix; it carries no coordinates, so a point is read once, when a
 * person has actually picked one.
 */
import { describe, it, expect, vi } from 'vitest';
import { suggest, predictionsToHits, placePoint, searchAreas, searchPlaces, PLACES_SUGGEST_URL, PLACES_SEARCH_URL } from '../../../../api/_app/services/money/home.js';

const ok = (json) => ({ ok: true, json: async () => json });

const PREDICTIONS = {
  suggestions: [
    { placePrediction: { placeId: 'p1', types: ['sublocality'], structuredFormat: { mainText: { text: 'Recoletos' }, secondaryText: { text: 'Salamanca, Madrid, España' } } } },
    { placePrediction: { placeId: 'p2', types: ['locality'], text: { text: 'Recas, Toledo' }, structuredFormat: { mainText: { text: 'Recas' }, secondaryText: { text: 'Toledo, España' } } } },
    { queryPrediction: { text: { text: 'ignored' } } },
  ],
};

describe('what is being typed', () => {
  it('asks autocomplete, in Spain, and reads the predictions as rows', async () => {
    const fetchImpl = vi.fn(async () => ok(PREDICTIONS));
    const hits = await suggest('Recolet', { kinds: ['sublocality'], key: 'k', fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(PLACES_SUGGEST_URL);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ input: 'Recolet', regionCode: 'ES', includedPrimaryTypes: ['sublocality'] });
    expect(init.headers['X-Goog-Api-Key']).toBe('k');
    /* Spain is dropped from the second line, and a query prediction is not a place. */
    expect(hits).toEqual([
      { id: 'p1', label: 'Recoletos', secondary: 'Salamanca, Madrid', kind: 'sublocality' },
      { id: 'p2', label: 'Recas', secondary: 'Toledo', kind: 'locality' },
    ]);
  });

  it('says nothing without a key or without two letters', async () => {
    const fetchImpl = vi.fn(async () => ok(PREDICTIONS));
    expect(await suggest('R', { key: 'k', fetchImpl })).toEqual([]);
    expect(await suggest('Recoletos', { key: '', fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('holds nothing from an answer it cannot read', () => {
    expect(predictionsToHits(null)).toEqual([]);
    expect(predictionsToHits({ suggestions: [{ placePrediction: { placeId: 'x' } }] })).toEqual([]);
  });
});

describe('where a picked prediction is', () => {
  it('reads the point once, by id', async () => {
    const fetchImpl = vi.fn(async () => ok({ id: 'p1', displayName: { text: 'Recoletos' }, formattedAddress: 'Recoletos, Madrid, España', location: { latitude: 40.42, longitude: -3.68 }, types: ['sublocality'] }));
    const point = await placePoint('p1', { key: 'k', fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toContain('/places/p1');
    expect(point).toEqual({ id: 'p1', label: 'Recoletos', secondary: 'Recoletos, Madrid', lat: 40.42, lng: -3.68, kind: 'sublocality' });
  });

  it('answers nothing for a place with no location', async () => {
    const fetchImpl = vi.fn(async () => ok({ id: 'p1', displayName: { text: 'x' } }));
    expect(await placePoint('p1', { key: 'k', fetchImpl })).toBeNull();
    expect(await placePoint('', { key: 'k', fetchImpl })).toBeNull();
  });
});

describe('the search behind it', () => {
  it('prefers what is being typed and keeps text search for when nothing is predicted', async () => {
    const both = vi.fn(async (url) => (url === PLACES_SUGGEST_URL ? ok(PREDICTIONS) : ok({ places: [] })));
    expect((await searchAreas('Recolet', { key: 'k', fetchImpl: both }))[0].label).toBe('Recoletos');
    expect(both.mock.calls).toHaveLength(1);

    const empty = vi.fn(async (url) => (url === PLACES_SUGGEST_URL
      ? ok({ suggestions: [] })
      : ok({ places: [{ id: 'g1', displayName: { text: 'IE University' }, formattedAddress: 'Madrid, España', types: ['university'], primaryType: 'university' }] })));
    const found = await searchPlaces('IE University', { key: 'k', fetchImpl: empty });
    expect(empty.mock.calls.map((c) => c[0])).toEqual([PLACES_SUGGEST_URL, PLACES_SEARCH_URL]);
    expect(found[0]).toMatchObject({ label: 'IE University', kind: 'university' });
  });
});
