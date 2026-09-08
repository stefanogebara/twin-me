/**
 * The merchant names here are the ones a real Santander España feed produced (read
 * 2026-09-08), already through narrative.js. The provider bodies are trimmed copies
 * of Google Places (New) and Nominatim jsonv2 responses.
 *
 * No test may reach the network: every case injects fetchImpl, and the two cases
 * that must not call out at all assert the mock was never touched.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  lookupPlace, describePlace, providerFor, looksOnline, looksTruncated,
  categoryFromGoogleTypes, categoryFromOsm, categoryFromBrand,
  CATEGORIES, PROVIDER_NONE, GOOGLE_URL, GOOGLE_FIELD_MASK,
  NOMINATIM_URL, NOMINATIM_USER_AGENT, NOMINATIM_MIN_INTERVAL_MS,
  nominatimThrottleState, resetPlaceThrottle,
} from '../../../../api/services/money/places.js';

/** A provider response, shaped the way fetch shapes one. */
const ok = (body) => ({ ok: true, status: 200, json: async () => body });

const GOOGLE_MERCADONA = {
  places: [{
    id: 'ChIJmercadona',
    displayName: { text: 'Mercadona', languageCode: 'es' },
    formattedAddress: 'Av. de España 12, 28100 Alcobendas, Madrid, Spain',
    location: { latitude: 40.5405, longitude: -3.6417 },
    types: ['supermarket', 'grocery_store', 'food_store', 'store', 'point_of_interest', 'establishment'],
    primaryType: 'supermarket',
    priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
  }],
};

const NOMINATIM_OAKBERRY = [{
  place_id: 291337,
  osm_type: 'node',
  osm_id: 9987654321,
  lat: '40.4270',
  lon: '-3.7038',
  name: 'Oakberry Acai',
  display_name: 'Oakberry Acai, Gran Vía, Madrid, España',
  class: 'amenity',
  type: 'cafe',
  address: { city: 'Madrid', country_code: 'es' },
  extratags: { cuisine: 'acai' },
}];

/** The environment is global state; every test states the one it wants. */
const KEY = 'GOOGLE_PLACES_API_KEY';
let savedKey;
let savedFlag;

beforeEach(() => {
  savedKey = process.env[KEY];
  savedFlag = process.env.MONEY_PLACES_LOOKUP;
  delete process.env[KEY];
  delete process.env.MONEY_PLACES_LOOKUP;
  resetPlaceThrottle();
});

afterEach(() => {
  if (savedKey === undefined) delete process.env[KEY]; else process.env[KEY] = savedKey;
  if (savedFlag === undefined) delete process.env.MONEY_PLACES_LOOKUP; else process.env.MONEY_PLACES_LOOKUP = savedFlag;
});

describe('providerFor', () => {
  it('takes Google when a key is configured and Nominatim when there is none', () => {
    expect(providerFor({})).toBe('nominatim');
    expect(providerFor({ GOOGLE_PLACES_API_KEY: 'k' })).toBe('google');
  });

  it('looks nothing up when the process says off', () => {
    expect(providerFor({ MONEY_PLACES_LOOKUP: 'off', GOOGLE_PLACES_API_KEY: 'k' })).toBe(PROVIDER_NONE);
  });
});

describe('lookupPlace, Google branch', () => {
  it('posts the name and the city to Text Search with the key and the field mask', async () => {
    const fetchImpl = vi.fn(async () => ok(GOOGLE_MERCADONA));
    const place = await lookupPlace({
      name: 'Mercadona',
      city: 'Alcobendas',
      fetchImpl,
      env: { GOOGLE_PLACES_API_KEY: 'test-key' },
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(GOOGLE_URL);
    expect(init.method).toBe('POST');
    expect(init.headers['X-Goog-Api-Key']).toBe('test-key');
    expect(init.headers['X-Goog-FieldMask']).toBe(GOOGLE_FIELD_MASK);

    const body = JSON.parse(init.body);
    expect(body.textQuery).toContain('Mercadona');
    expect(body.textQuery).toContain('Alcobendas');
    expect(body.languageCode).toBe('es');
    expect(body.maxResultCount).toBe(1);
    expect(body.regionCode).toBe('ES');

    expect(place).toMatchObject({
      name: 'Mercadona',
      kind: 'supermarket',
      category: 'groceries',
      lat: 40.5405,
      lon: -3.6417,
      city: 'Alcobendas',
      country: 'ES',
      provider: 'google',
      provider_place_id: 'ChIJmercadona',
      confidence: 0.9,
    });
    expect(place.raw.primaryType).toBe('supermarket');
  });

  it('sends the merchant, the city and the country and nothing else about the person', async () => {
    const fetchImpl = vi.fn(async () => ok(GOOGLE_MERCADONA));
    await lookupPlace({
      /* A careless caller spreads a whole transaction row into the options. */
      name: 'Mercadona',
      city: 'Alcobendas',
      amount: -47.35,
      card_last4: '1245',
      user_id: '167c27b5-a40b-49fb-8d00-deb1b1c57f4d',
      transaction_id: 'txn_9f2c',
      iban: 'ES9121000418450200051332',
      fetchImpl,
      env: { GOOGLE_PLACES_API_KEY: 'test-key' },
    });

    const [url, init] = fetchImpl.mock.calls[0];
    const sent = `${url} ${JSON.stringify(init.headers)} ${init.body}`;
    for (const secret of ['47.35', '1245', '167c27b5', 'txn_9f2c', 'ES9121000418450200051332', 'amount', 'user_id', 'transaction_id', 'iban']) {
      expect(sent).not.toContain(secret);
    }
    expect(JSON.parse(init.body)).toEqual({
      textQuery: 'Mercadona, Alcobendas', languageCode: 'es', maxResultCount: 1, regionCode: 'ES',
    });
  });

  it('carries a location bias only when the caller supplies coordinates', async () => {
    const fetchImpl = vi.fn(async () => ok(GOOGLE_MERCADONA));
    await lookupPlace({ name: 'Mercadona', fetchImpl, env: { GOOGLE_PLACES_API_KEY: 'k' } });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).locationBias).toBeUndefined();

    await lookupPlace({
      name: 'Mercadona', fetchImpl, env: { GOOGLE_PLACES_API_KEY: 'k' },
      bias: { lat: 40.4168, lon: -3.7038, radiusMeters: 15000 },
    });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).locationBias).toEqual({
      circle: { center: { latitude: 40.4168, longitude: -3.7038 }, radius: 15000 },
    });
  });

  it('drops to a loose confidence when Google answers with a different name', async () => {
    const loose = {
      places: [{
        id: 'ChIJother',
        displayName: { text: 'Supermercado Ahorramas' },
        formattedAddress: 'Calle Mayor 3, 28013 Madrid, Spain',
        location: { latitude: 40.4155, longitude: -3.7074 },
        types: ['supermarket', 'store'],
        primaryType: 'supermarket',
      }],
    };
    const place = await lookupPlace({
      name: 'Arbitrade Madrid', fetchImpl: async () => ok(loose), env: { GOOGLE_PLACES_API_KEY: 'k' },
    });
    expect(place.confidence).toBe(0.6);
    expect(place.name).toBe('Supermercado Ahorramas');
    /* No city was printed by the bank, so it comes off the postcode line. */
    expect(place.city).toBe('Madrid');
  });

  it('is null when Google matches nothing and when the result has no coordinates', async () => {
    expect(await lookupPlace({ name: 'Mrrynflv', fetchImpl: async () => ok({}), env: { GOOGLE_PLACES_API_KEY: 'k' } })).toBeNull();
    expect(await lookupPlace({ name: 'Mrrynflv', fetchImpl: async () => ok({ places: [] }), env: { GOOGLE_PLACES_API_KEY: 'k' } })).toBeNull();
    const noPoint = { places: [{ id: 'x', displayName: { text: 'X' }, types: ['store'] }] };
    expect(await lookupPlace({ name: 'X', fetchImpl: async () => ok(noPoint), env: { GOOGLE_PLACES_API_KEY: 'k' } })).toBeNull();
  });
});

describe('lookupPlace, Nominatim branch', () => {
  it('gets the search endpoint with the declared user agent when no key is set', async () => {
    const fetchImpl = vi.fn(async () => ok(NOMINATIM_OAKBERRY));
    const place = await lookupPlace({ name: 'Oakberry Acai', city: 'Madrid', fetchImpl, env: {} });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url.startsWith(`${NOMINATIM_URL}?`)).toBe(true);
    expect(init.headers['User-Agent']).toBe(NOMINATIM_USER_AGENT);

    const params = new URL(url).searchParams;
    expect(params.get('q')).toBe('Oakberry Acai, Madrid, ES');
    expect(params.get('format')).toBe('jsonv2');
    expect(params.get('limit')).toBe('1');
    expect(params.get('addressdetails')).toBe('1');
    expect(params.get('extratags')).toBe('1');

    expect(place).toMatchObject({
      name: 'Oakberry Acai',
      kind: 'cafe',
      category: 'coffee',
      lat: 40.427,
      lon: -3.7038,
      city: 'Madrid',
      country: 'ES',
      provider: 'nominatim',
      provider_place_id: 'node/9987654321',
      confidence: 0.5,
    });
  });

  it('keeps two Nominatim calls a second apart, and says so in its throttle state', async () => {
    const fetchImpl = vi.fn(async () => ok(NOMINATIM_OAKBERRY));
    const slept = [];
    const sleepImpl = vi.fn(async (ms) => { slept.push(ms); });
    /* A frozen clock is the worst case: both calls arrive in the same millisecond. */
    const now = () => 5_000_000;

    await lookupPlace({ name: 'Oakberry Acai', fetchImpl, env: {}, now, sleepImpl });
    expect(sleepImpl).not.toHaveBeenCalled();
    expect(nominatimThrottleState().lastRequestAt).toBe(5_000_000);

    await lookupPlace({ name: 'Renfe Cercanias', fetchImpl, env: {}, now, sleepImpl });
    expect(slept).toEqual([NOMINATIM_MIN_INTERVAL_MS]);
    /* The second request is booked a full interval after the first, not at "now". */
    expect(nominatimThrottleState().lastRequestAt).toBe(5_000_000 + NOMINATIM_MIN_INTERVAL_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    await lookupPlace({ name: 'El Corte Ingles', fetchImpl, env: {}, now, sleepImpl });
    expect(slept).toEqual([NOMINATIM_MIN_INTERVAL_MS, 2 * NOMINATIM_MIN_INTERVAL_MS]);
  });

  it('reads a train station out of the OSM class when the type is generic', async () => {
    const station = [{
      osm_type: 'node', osm_id: 42, lat: '40.4069', lon: '-3.6913',
      name: 'Atocha Cercanías', display_name: 'Atocha Cercanías, Madrid, España',
      class: 'railway', type: 'station', address: { city: 'Madrid', country_code: 'es' },
    }];
    const place = await lookupPlace({ name: 'Renfe Cercanias', fetchImpl: async () => ok(station), env: {} });
    expect(place).toMatchObject({ kind: 'train station', category: 'transport', confidence: 0.5 });
    expect(describePlace(place)).toBe('train station in Madrid');
  });

  it('is null on an empty array and on a row with no coordinates', async () => {
    expect(await lookupPlace({ name: 'Mrrynflv', fetchImpl: async () => ok([]), env: {} })).toBeNull();
    expect(await lookupPlace({ name: 'Mrrynflv', fetchImpl: async () => ok([{ name: 'X', class: 'shop', type: 'yes' }]), env: {} })).toBeNull();
  });
});

describe('categoryFromGoogleTypes', () => {
  it('maps every kind of place the feed produces onto the vocabulary', () => {
    const cases = [
      [['supermarket'], 'supermarket', 'groceries'],
      [['grocery_store'], undefined, 'groceries'],
      [['convenience_store'], undefined, 'groceries'],
      [['restaurant'], 'restaurant', 'eating out'],
      [['meal_takeaway'], undefined, 'eating out'],
      [['fast_food_restaurant'], undefined, 'eating out'],
      [['bakery'], undefined, 'eating out'],
      [['cafe'], 'cafe', 'coffee'],
      [['coffee_shop'], undefined, 'coffee'],
      [['train_station'], 'train_station', 'transport'],
      [['subway_station'], undefined, 'transport'],
      [['transit_station'], undefined, 'transport'],
      [['bus_station'], undefined, 'transport'],
      [['taxi_stand'], undefined, 'taxi'],
      [['gas_station'], undefined, 'fuel'],
      [['hospital'], undefined, 'health'],
      [['doctor'], undefined, 'health'],
      [['dentist'], undefined, 'health'],
      [['pharmacy'], undefined, 'pharmacy'],
      [['drugstore'], undefined, 'pharmacy'],
      [['gym'], undefined, 'sport'],
      [['sports_complex'], undefined, 'sport'],
      [['school'], undefined, 'education'],
      [['university'], undefined, 'education'],
      [['library'], undefined, 'education'],
      [['clothing_store'], undefined, 'clothing'],
      [['shoe_store'], undefined, 'clothing'],
      [['home_goods_store'], undefined, 'home'],
      [['furniture_store'], undefined, 'home'],
      [['hardware_store'], undefined, 'home'],
      [['electronics_store'], undefined, 'electronics'],
      [['movie_theater'], undefined, 'entertainment'],
      [['night_club'], undefined, 'entertainment'],
      [['bar'], undefined, 'entertainment'],
      [['amusement_park'], undefined, 'entertainment'],
      [['travel_agency'], undefined, 'travel'],
      [['airport'], undefined, 'travel'],
      [['hotel'], undefined, 'lodging'],
      [['lodging'], undefined, 'lodging'],
      [['atm'], undefined, 'cash'],
      [['bank'], undefined, 'cash'],
    ];
    for (const [types, primary, expected] of cases) {
      expect(categoryFromGoogleTypes(types, primary), types[0]).toBe(expected);
      expect(CATEGORIES).toContain(expected);
    }
  });

  it('prefers the primary type, and falls through to other', () => {
    expect(categoryFromGoogleTypes(['store', 'pharmacy'], 'supermarket')).toBe('groceries');
    /* A primary type nobody mapped still lets the type list answer. */
    expect(categoryFromGoogleTypes(['store', 'pharmacy'], 'wholesaler')).toBe('pharmacy');
    expect(categoryFromGoogleTypes(['florist', 'store'], 'florist')).toBe('other');
    expect(categoryFromGoogleTypes(undefined, undefined)).toBe('other');
    expect(categoryFromGoogleTypes([], null)).toBe('other');
  });
});

describe('categoryFromOsm', () => {
  it('maps OSM class and type onto the same vocabulary', () => {
    const cases = [
      [{ class: 'shop', type: 'supermarket' }, 'groceries'],
      [{ class: 'shop', type: 'convenience' }, 'groceries'],
      [{ class: 'amenity', type: 'restaurant' }, 'eating out'],
      [{ class: 'amenity', type: 'fast_food' }, 'eating out'],
      [{ class: 'shop', type: 'bakery' }, 'eating out'],
      [{ class: 'amenity', type: 'cafe' }, 'coffee'],
      [{ class: 'railway', type: 'station' }, 'transport'],
      [{ class: 'railway', type: 'tram_stop' }, 'transport'],
      [{ class: 'public_transport', type: 'stop_position' }, 'transport'],
      [{ class: 'amenity', type: 'bus_station' }, 'transport'],
      [{ class: 'amenity', type: 'taxi' }, 'taxi'],
      [{ class: 'amenity', type: 'fuel' }, 'fuel'],
      [{ class: 'amenity', type: 'pharmacy' }, 'pharmacy'],
      [{ class: 'amenity', type: 'hospital' }, 'health'],
      [{ class: 'amenity', type: 'clinic' }, 'health'],
      [{ class: 'amenity', type: 'doctors' }, 'health'],
      [{ class: 'leisure', type: 'fitness_centre' }, 'sport'],
      [{ class: 'leisure', type: 'sports_centre' }, 'sport'],
      [{ class: 'amenity', type: 'school' }, 'education'],
      [{ class: 'amenity', type: 'university' }, 'education'],
      [{ class: 'shop', type: 'clothes' }, 'clothing'],
      [{ class: 'shop', type: 'shoes' }, 'clothing'],
      [{ class: 'shop', type: 'furniture' }, 'home'],
      [{ class: 'shop', type: 'electronics' }, 'electronics'],
      [{ class: 'amenity', type: 'cinema' }, 'entertainment'],
      [{ class: 'amenity', type: 'atm' }, 'cash'],
      [{ class: 'amenity', type: 'bank' }, 'cash'],
      [{ class: 'tourism', type: 'hotel' }, 'lodging'],
      [{ class: 'aeroway', type: 'aerodrome' }, 'travel'],
    ];
    for (const [row, expected] of cases) {
      expect(categoryFromOsm(row), `${row.class}=${row.type}`).toBe(expected);
      expect(CATEGORIES).toContain(expected);
    }
  });

  it('reads the real tag out of extratags, and falls through to other', () => {
    expect(categoryFromOsm({ class: 'place', type: 'house', extratags: { shop: 'supermarket' } })).toBe('groceries');
    expect(categoryFromOsm({ class: 'building', type: 'yes', extratags: { amenity: 'pharmacy' } })).toBe('pharmacy');
    expect(categoryFromOsm({ class: 'boundary', type: 'administrative' })).toBe('other');
    expect(categoryFromOsm({ class: 'shop', type: 'florist' })).toBe('other');
    expect(categoryFromOsm({})).toBe('other');
    expect(categoryFromOsm()).toBe('other');
  });
});

describe('online brands', () => {
  it('recognises a domain and a known brand, and leaves a shop on the street', () => {
    expect(looksOnline('Elevenlabs.io')).toBe(true);
    expect(looksOnline('Playtomic.io')).toBe(true);
    expect(looksOnline('Spotify')).toBe(true);
    expect(looksOnline('Netflix')).toBe(true);
    expect(looksOnline('Figma')).toBe(true);
    expect(looksOnline('Oakberry Acai')).toBe(false);
    expect(looksOnline('Renfe Cercanias')).toBe(false);
    /* An Apple Store is a shop you walk into, whatever the brand is famous for. */
    expect(looksOnline('Apple Store Madrid')).toBe(false);
    expect(looksOnline('')).toBe(false);
  });

  it('decides an online charge with no request at all', async () => {
    const fetchImpl = vi.fn();
    const spotify = await lookupPlace({ name: 'Spotify', city: 'Stockholm', fetchImpl, env: { GOOGLE_PLACES_API_KEY: 'k' } });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(spotify).toEqual({
      name: 'Spotify', kind: 'online', category: 'entertainment',
      lat: null, lon: null, city: null, country: null,
      provider: PROVIDER_NONE, provider_place_id: null, confidence: 1, raw: null,
    });
    expect(describePlace(spotify)).toBe('online');

    const eleven = await lookupPlace({ name: 'Elevenlabs.io', fetchImpl, env: {} });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(eleven).toMatchObject({ kind: 'online', category: 'software', lat: null, lon: null });

    const netflix = await lookupPlace({ name: 'Netflix', fetchImpl, env: {} });
    expect(netflix.category).toBe('entertainment');
  });
});

describe('names the bank cut off', () => {
  it('sees a cut only where a real name could not end', () => {
    expect(looksTruncated('Empresa Municip')).toBe(true);
    expect(looksTruncated('We Taxi Licenci')).toBe(true);
    /* Exactly fifteen characters and entirely whole: width alone must not condemn it. */
    expect(looksTruncated('El Corte Ingles')).toBe(false);
    expect(looksTruncated('Renfe Cercanias')).toBe(false);
    expect(looksTruncated('Oakberry Acai')).toBe(false);
    expect(looksTruncated('Restaurante Sacha Group')).toBe(false);
  });

  it('caps a cut name at a low confidence however well the provider matched', async () => {
    const emt = {
      places: [{
        id: 'ChIJemt',
        /* Google happily completes the stem, and could as happily complete it wrong. */
        displayName: { text: 'Empresa Municipal de Transportes de Madrid' },
        formattedAddress: 'Calle Cerro de la Plata 4, 28007 Madrid, Spain',
        location: { latitude: 40.4004, longitude: -3.6685 },
        types: ['transit_station', 'point_of_interest'],
        primaryType: 'transit_station',
      }],
    };
    const place = await lookupPlace({ name: 'Empresa Municip', city: 'Madrid', fetchImpl: async () => ok(emt), env: { GOOGLE_PLACES_API_KEY: 'k' } });
    expect(place.category).toBe('transport');
    expect(place.confidence).toBeLessThanOrEqual(0.4);

    const taxi = [{
      osm_type: 'node', osm_id: 7, lat: '40.4200', lon: '-3.7000',
      name: 'We Taxi Licencias', class: 'amenity', type: 'taxi',
      address: { city: 'Madrid', country_code: 'es' },
    }];
    const osm = await lookupPlace({ name: 'We Taxi Licenci', fetchImpl: async () => ok(taxi), env: {} });
    expect(osm.confidence).toBeLessThanOrEqual(0.4);
    expect(osm.category).toBe('taxi');
  });
});

describe('failing soft', () => {
  it('is null on a non-200, a rate limit, a malformed body and a thrown fetch', async () => {
    const cases = [
      async () => ({ ok: false, status: 500, json: async () => ({}) }),
      async () => ({ ok: false, status: 429, json: async () => ({}) }),
      async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token < in JSON'); } }),
      async () => ok('<html>service unavailable</html>'),
      async () => { throw new TypeError('fetch failed'); },
      async () => undefined,
    ];
    /* A controlled clock and sleep: the Nominatim branch throttles, and this loop
       must not spend six real seconds proving that a 500 is null. */
    const now = () => 1000;
    const sleepImpl = async () => {};
    for (const fetchImpl of cases) {
      expect(await lookupPlace({ name: 'Mercadona', fetchImpl, env: { GOOGLE_PLACES_API_KEY: 'k' } })).toBeNull();
      expect(await lookupPlace({ name: 'Mercadona', fetchImpl, env: {}, now, sleepImpl })).toBeNull();
    }
  });

  it('is null with no name, and null when the process looks nothing up', async () => {
    const fetchImpl = vi.fn(async () => ok(GOOGLE_MERCADONA));
    expect(await lookupPlace({ name: '', fetchImpl, env: {} })).toBeNull();
    expect(await lookupPlace({ name: '  ,  ', fetchImpl, env: {} })).toBeNull();
    expect(await lookupPlace({})).toBeNull();
    expect(await lookupPlace({ name: 'Mercadona', fetchImpl, env: { MONEY_PLACES_LOOKUP: 'off' } })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reads the environment when the caller passes none', async () => {
    process.env.MONEY_PLACES_LOOKUP = 'off';
    expect(await lookupPlace({ name: 'Mercadona', fetchImpl: async () => ok(GOOGLE_MERCADONA) })).toBeNull();
  });
});

describe('describePlace', () => {
  it('says the kind of place and the town, and nothing about the place', () => {
    expect(describePlace({ kind: 'supermarket', category: 'groceries', city: 'Madrid' })).toBe('supermarket in Madrid');
    expect(describePlace({ kind: 'cafe', category: 'coffee', city: 'Alcobendas' })).toBe('cafe in Alcobendas');
    expect(describePlace({ kind: 'train station', category: 'transport', city: 'Madrid' })).toBe('train station in Madrid');
    expect(describePlace({ kind: 'online', category: 'software' })).toBe('online');
    /* No kind and no town: the category is the last thing left to say. */
    expect(describePlace({ kind: null, category: 'transport', city: null })).toBe('transport');
    expect(describePlace(null)).toBeNull();
  });
});

describe('CATEGORIES', () => {
  it('is the fixed vocabulary, frozen', () => {
    expect(CATEGORIES).toEqual([
      'groceries', 'eating out', 'coffee', 'transport', 'taxi', 'fuel', 'health',
      'pharmacy', 'sport', 'education', 'clothing', 'home', 'electronics',
      'entertainment', 'software', 'travel', 'lodging', 'cash', 'fees', 'transfers',
      'other',
    ]);
    expect(Object.isFrozen(CATEGORIES)).toBe(true);
  });
});

/* A geocoder placed 19 of 38 real merchants and filed El Corte Inglés, Carrefour, Cabify
   and Metro de Madrid under "other". These are the names that repeat every month. */
describe('categoryFromBrand', () => {
  it('knows the Spanish names a geocoder misses', () => {
    expect(categoryFromBrand('Carrefour Market')).toMatchObject({ category: 'groceries' });
    expect(categoryFromBrand('El Corte Inglés')).toMatchObject({ category: 'clothing' });
    expect(categoryFromBrand('Metro de Madrid')).toMatchObject({ category: 'transport' });
    expect(categoryFromBrand('Renfe Cercanias')).toMatchObject({ category: 'transport' });
    expect(categoryFromBrand('Cabify')).toMatchObject({ category: 'taxi' });
    expect(categoryFromBrand('Torre IE')).toMatchObject({ category: 'education' });
    expect(categoryFromBrand('Oakberry Acai')).toMatchObject({ category: 'eating out' });
  });

  it('reads a bank-truncated brand from its start', () => {
    expect(categoryFromBrand('El Corte Ingl')).toMatchObject({ category: 'clothing' });
    expect(categoryFromBrand('We Taxi Licenci')).toMatchObject({ category: 'taxi' });
  });

  it('knows the tools a builder pays for, and the streams they watch', () => {
    expect(categoryFromBrand('Openrouter')).toMatchObject({ category: 'software' });
    expect(categoryFromBrand('Elevenlabs.io')).toMatchObject({ category: 'software' });
    expect(categoryFromBrand('Fly.io')).toMatchObject({ category: 'software' });
    expect(categoryFromBrand('Spotify')).toMatchObject({ category: 'entertainment' });
  });

  it('says nothing about a name it does not know, rather than guessing', () => {
    expect(categoryFromBrand('Expvillanueva')).toBe(null);
    expect(categoryFromBrand('M1ggkeml')).toBe(null);
    expect(categoryFromBrand('')).toBe(null);
    expect(categoryFromBrand(null)).toBe(null);
  });

  it('returns a word from the shared vocabulary every time', () => {
    for (const name of ['Mercadona', 'Cabify', 'Spotify', 'Farmacia Central', 'Ikea', 'Booking', 'Cajero 4321']) {
      const hit = categoryFromBrand(name);
      expect(CATEGORIES).toContain(hit.category);
    }
  });
});
