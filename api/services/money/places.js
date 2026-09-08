/**
 * Places: what kind of place a ledger line was, and where it is.
 * ==============================================================
 * "COMPRA Oakberry Acai, MADRID ES" is a row nobody can read by kind of place. Once
 * the merchant is resolved — a supermarket, a train station, a cafe in Alcobendas —
 * a month reads as "groceries 180 €, transport 42 €, eating out 96 €" and can be
 * drawn on a map. This module is that resolution step and nothing else.
 *
 * A lookup layer only: no Supabase, no Express, no cache. One name in, one place or
 * null out. The caller caches, because a merchant's coordinates do not change and
 * both providers are rate-limited.
 *
 * PRIVACY CONSTRAINT: only the merchant name, the city the bank printed and the
 * country ever leave this file. Never an amount, never a card number or its last
 * four, never a user id, never a transaction id, never an IBAN. `lookupPlace` reads
 * only `name`, `city` and `country` off its options, so there is nothing else to
 * leak; anything a caller passes alongside them is ignored, not forwarded.
 *
 * Two providers, chosen at call time:
 *   1. Google Places (New) Text Search, when GOOGLE_PLACES_API_KEY is set. It copes
 *      with a card descriptor and it returns a place type worth mapping.
 *   2. Nominatim (OpenStreetMap), the no-key default. Free, and capped by their
 *      usage policy at one request a second — enforced in here, not by the caller.
 *
 * Fail soft: a network error, a non-200, a rate limit or a malformed body is null.
 * A place the twin is unsure of is worse than no place at all, so a name the bank
 * cut off mid-word can only come back with a low confidence.
 */

export const PROVIDER_NONE = 'none';
export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_NOMINATIM = 'nominatim';

export const GOOGLE_URL = 'https://places.googleapis.com/v1/places:searchText';
export const GOOGLE_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.priceLevel';
export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
/** Nominatim's policy requires a descriptive agent; an anonymous one gets blocked. */
export const NOMINATIM_USER_AGENT = 'TwinMe/1.0 (money place lookup)';
export const NOMINATIM_MIN_INTERVAL_MS = 1000;

/** Confidence a cut name can never exceed, whatever the provider answered. */
export const TRUNCATED_CONFIDENCE = 0.4;

/**
 * The whole vocabulary. Plain lowercase words, because they are printed to a person
 * as they are ("transport 42 €"), and a fixed list so two months are comparable.
 */
export const CATEGORIES = Object.freeze([
  'groceries', 'eating out', 'coffee', 'transport', 'taxi', 'fuel', 'health',
  'pharmacy', 'sport', 'education', 'clothing', 'home', 'electronics',
  'entertainment', 'software', 'travel', 'lodging', 'cash', 'fees', 'transfers',
  'other',
]);

/* ------------------------------------------------------------------ provider */

/**
 * Which provider this process can use. Google when a key is configured, Nominatim
 * otherwise, and PROVIDER_NONE when lookups are switched off — a cron that must not
 * make outbound calls sets MONEY_PLACES_LOOKUP=off and every lookup returns null.
 */
export function providerFor(env = process.env) {
  if (String(env?.MONEY_PLACES_LOOKUP || '').toLowerCase() === 'off') return PROVIDER_NONE;
  if (env?.GOOGLE_PLACES_API_KEY) return PROVIDER_GOOGLE;
  return PROVIDER_NOMINATIM;
}

/* ------------------------------------------------------------------ category */

/** Google's place types, collapsed onto CATEGORIES. */
const GOOGLE_CATEGORY = new Map(Object.entries({
  supermarket: 'groceries', grocery_store: 'groceries', convenience_store: 'groceries',
  food_store: 'groceries', butcher_shop: 'groceries', wine_store: 'groceries',
  restaurant: 'eating out', meal_takeaway: 'eating out', meal_delivery: 'eating out',
  fast_food_restaurant: 'eating out', bakery: 'eating out', pizza_restaurant: 'eating out',
  sandwich_shop: 'eating out', ice_cream_shop: 'eating out', juice_shop: 'eating out',
  cafe: 'coffee', coffee_shop: 'coffee', cafeteria: 'coffee',
  train_station: 'transport', subway_station: 'transport', transit_station: 'transport',
  bus_station: 'transport', bus_stop: 'transport', light_rail_station: 'transport',
  parking: 'transport', park_and_ride: 'transport',
  taxi_stand: 'taxi',
  gas_station: 'fuel', electric_vehicle_charging_station: 'fuel',
  hospital: 'health', doctor: 'health', dentist: 'health', physiotherapist: 'health',
  medical_lab: 'health', wellness_center: 'health',
  pharmacy: 'pharmacy', drugstore: 'pharmacy',
  gym: 'sport', sports_complex: 'sport', fitness_center: 'sport', sports_club: 'sport',
  swimming_pool: 'sport', sports_activity_location: 'sport',
  school: 'education', university: 'education', library: 'education',
  primary_school: 'education', secondary_school: 'education', preschool: 'education',
  clothing_store: 'clothing', shoe_store: 'clothing', jewelry_store: 'clothing',
  home_goods_store: 'home', furniture_store: 'home', hardware_store: 'home',
  home_improvement_store: 'home', garden_center: 'home',
  electronics_store: 'electronics', cell_phone_store: 'electronics',
  movie_theater: 'entertainment', night_club: 'entertainment', bar: 'entertainment',
  amusement_park: 'entertainment', concert_hall: 'entertainment', casino: 'entertainment',
  travel_agency: 'travel', airport: 'travel', international_airport: 'travel',
  hotel: 'lodging', lodging: 'lodging', guest_house: 'lodging', hostel: 'lodging',
  atm: 'cash', bank: 'cash',
}));

/**
 * Google returns a primary type and a list of types. The primary type is the one the
 * place calls itself, so it decides; the list is the fallback, in its own order,
 * because Google sorts it from specific to generic.
 */
export function categoryFromGoogleTypes(types, primaryType) {
  if (primaryType && GOOGLE_CATEGORY.has(primaryType)) return GOOGLE_CATEGORY.get(primaryType);
  for (const t of Array.isArray(types) ? types : []) {
    if (GOOGLE_CATEGORY.has(t)) return GOOGLE_CATEGORY.get(t);
  }
  return 'other';
}

/** OpenStreetMap tags class=type, so the map is nested the same way. */
const OSM_CATEGORY = {
  shop: {
    supermarket: 'groceries', convenience: 'groceries', greengrocer: 'groceries',
    butcher: 'groceries', deli: 'groceries', wine: 'groceries', alcohol: 'groceries',
    bakery: 'eating out', pastry: 'eating out',
    coffee: 'coffee',
    clothes: 'clothing', shoes: 'clothing', boutique: 'clothing', jewelry: 'clothing',
    furniture: 'home', hardware: 'home', doityourself: 'home', houseware: 'home',
    electronics: 'electronics', computer: 'electronics', mobile_phone: 'electronics',
    chemist: 'pharmacy', sports: 'sport', travel_agency: 'travel',
  },
  amenity: {
    restaurant: 'eating out', fast_food: 'eating out', food_court: 'eating out',
    ice_cream: 'eating out',
    cafe: 'coffee',
    bus_station: 'transport', ferry_terminal: 'transport', parking: 'transport',
    bicycle_rental: 'transport', car_sharing: 'transport',
    taxi: 'taxi',
    fuel: 'fuel', charging_station: 'fuel',
    pharmacy: 'pharmacy',
    hospital: 'health', clinic: 'health', doctors: 'health', dentist: 'health',
    veterinary: 'health',
    school: 'education', university: 'education', college: 'education',
    library: 'education', kindergarten: 'education',
    atm: 'cash', bank: 'cash', bureau_de_change: 'cash',
    cinema: 'entertainment', nightclub: 'entertainment', bar: 'entertainment',
    pub: 'entertainment', theatre: 'entertainment', casino: 'entertainment',
  },
  leisure: {
    fitness_centre: 'sport', sports_centre: 'sport', pitch: 'sport',
    swimming_pool: 'sport', stadium: 'sport', sports_hall: 'sport',
  },
  tourism: {
    hotel: 'lodging', hostel: 'lodging', guest_house: 'lodging',
    apartment: 'lodging', motel: 'lodging',
  },
  aeroway: { aerodrome: 'travel', terminal: 'travel' },
  healthcare: { pharmacy: 'pharmacy', hospital: 'health', clinic: 'health', doctor: 'health' },
};

/** Classes where every type is the same category: a railway is transport, whatever it is. */
const OSM_CLASS_CATEGORY = { railway: 'transport', public_transport: 'transport' };

/**
 * The same vocabulary out of an OSM result. `extratags` is the second chance: a
 * building or an address node often carries the real shop=/amenity= tag there while
 * class/type say something structural.
 */
export function categoryFromOsm({ class: cls, type, extratags } = {}) {
  const direct = OSM_CATEGORY[cls]?.[type];
  if (direct) return direct;
  if (OSM_CLASS_CATEGORY[cls]) return OSM_CLASS_CATEGORY[cls];
  for (const key of ['shop', 'amenity', 'leisure', 'tourism', 'healthcare']) {
    const tag = extratags?.[key];
    const fromTag = tag && OSM_CATEGORY[key]?.[tag];
    if (fromTag) return fromTag;
  }
  return 'other';
}

/* -------------------------------------------------------------------- online */

/**
 * Brands with no street to stand in. A charge from one of these must never be
 * geocoded: a geocoder asked for "Netflix" answers with an office in Amsterdam, and
 * a dot on a map where nobody has ever been is a lie the whole map pays for.
 */
const ONLINE_BRANDS = new Map(Object.entries({
  spotify: 'entertainment', netflix: 'entertainment',
  openai: 'software', anthropic: 'software', github: 'software', vercel: 'software',
  render: 'software', fly: 'software', elevenlabs: 'software', higgsfield: 'software',
  twilio: 'software', aws: 'software', google: 'software', apple: 'software',
  microsoft: 'software', adobe: 'software', notion: 'software', figma: 'software',
  linear: 'software', stripe: 'software',
}));

/** Words that put a brand back on a street: an Apple Store is a shop you walk into. */
const STOREFRONT = /\b(store|shop|tienda|market|mercado|cafe|restaurant|restaurante|hotel|cinema)\b/i;

function words(name) {
  return String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function brandIn(name) {
  if (STOREFRONT.test(String(name || ''))) return null;
  for (const w of words(name)) if (ONLINE_BRANDS.has(w)) return w;
  return null;
}

/** A dot in the middle of a name is a domain: ELEVENLABS.IO, PLAYTOMIC.IO, BOLT.EU. */
const DOMAIN = /[a-z0-9]\.[a-z]{2,}(\/|$|\b)/i;

export function looksOnline(name) {
  const raw = String(name || '').trim();
  if (!raw) return false;
  if (DOMAIN.test(raw)) return true;
  return brandIn(raw) !== null;
}

/**
 * Streaming is entertainment, a tool is software. An unrecognised domain is filed as
 * software: it is a charge for something used through a screen, which is what the
 * category has to mean for the total to make sense.
 */
function onlineCategory(name) {
  for (const w of words(name)) if (ONLINE_BRANDS.has(w)) return ONLINE_BRANDS.get(w);
  return 'software';
}

/* ---------------------------------------------------------------- truncation */

/**
 * The bank cuts a card descriptor at fifteen characters, so "Empresa Municipal de
 * Transportes" arrives as "Empresa Municip" and "We Taxi Licencias" as "We Taxi
 * Licenci". A geocoder cannot see the cut: it answers with the nearest thing to a
 * stem and the answer looks as good as any other. A wrong place stated confidently
 * is worse than none, so a cut name is capped at TRUNCATED_CONFIDENCE.
 *
 * Two signals have to agree, because neither alone is safe:
 *   1. Width. Fourteen characters or more. A shorter name was not cut — the field
 *      still had room. ("El Corte Ingles" is exactly fifteen, so width alone would
 *      condemn a real name.)
 *   2. An ending no whole word has. Spanish and English words do not end in p, q or
 *      v, and a long word does not end in consonant + i ("Licenci", "Cercani");
 *      Spanish -i words are short loans (taxi, esqui). A one or two letter last
 *      token is a fragment too.
 *
 * The rule is deliberately narrow: it fires only on endings a real name cannot have,
 * so it never demotes a name that arrived whole. It therefore misses cuts that land
 * on an ordinary letter — those are caught, partly, by the match test against what
 * the provider answered.
 */
const BANK_FIELD_MIN = 14;
const IMPOSSIBLE_FINAL = /[pqv]$/i;
const STEM_I = /[^aeiouáéíóú]i$/i;
/** Whole words that do end in p, and would otherwise read as stems. */
const REAL_P_WORDS = new Set(['group', 'shop', 'workshop', 'stop', 'top', 'up', 'corp', 'camp', 'pop']);

export function looksTruncated(name) {
  const clean = cleanName(name);
  if (!clean || clean.length < BANK_FIELD_MIN) return false;
  const last = clean.split(' ').pop();
  const plain = last.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (plain.length <= 2) return true;
  if (REAL_P_WORDS.has(plain)) return false;
  if (IMPOSSIBLE_FINAL.test(last)) return true;
  if (plain.length >= 6 && STEM_I.test(last)) return true;
  return false;
}

/* ------------------------------------------------------------------ throttle */

/**
 * Nominatim allows one request a second per application. The limit belongs here and
 * not in the caller: any route that resolves a screenful of merchants would otherwise
 * have to remember, and the day one forgets is the day the app is banned.
 */
let nominatimLastAt = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function throttleNominatim(now, sleepImpl) {
  const at = now();
  const due = nominatimLastAt + NOMINATIM_MIN_INTERVAL_MS;
  if (nominatimLastAt && at < due) {
    await sleepImpl(due - at);
    nominatimLastAt = due;
    return due - at;
  }
  nominatimLastAt = at;
  return 0;
}

/** What the throttle knows, for a test and for a health endpoint. */
export function nominatimThrottleState() {
  return { lastRequestAt: nominatimLastAt, minIntervalMs: NOMINATIM_MIN_INTERVAL_MS };
}

/** Forget the last request. A test calls this; a long-lived process never needs to. */
export function resetPlaceThrottle() {
  nominatimLastAt = 0;
}

/* -------------------------------------------------------------------- lookup */

function cleanName(name) {
  return String(name || '').replace(/\s{2,}/g, ' ').replace(/^[\s,.;-]+|[\s,.;-]+$/g, '').trim();
}

function normalize(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Generic Google types that name no kind of place a person would say out loud. */
const GENERIC_TYPES = new Set(['point_of_interest', 'establishment', 'food', 'store', 'place_of_worship', 'premise', 'political']);

function humanize(type) {
  return String(type || '').replace(/_/g, ' ').trim() || null;
}

function googleKind(types, primaryType) {
  if (primaryType && !GENERIC_TYPES.has(primaryType)) return humanize(primaryType);
  for (const t of Array.isArray(types) ? types : []) if (!GENERIC_TYPES.has(t)) return humanize(t);
  return null;
}

function osmKind(cls, type) {
  /* "station in Madrid" says less than "train station in Madrid", and the class is
     the half that carries the meaning for transport nodes. */
  if (cls === 'railway' && (type === 'station' || type === 'halt')) return 'train station';
  if (cls === 'railway' && type === 'subway_entrance') return 'metro station';
  if (cls === 'public_transport') return 'transport stop';
  if (type && type !== 'yes') return humanize(type);
  return humanize(cls);
}

/** A Spanish address prints the town after the postcode: "Calle X, 28001 Madrid, Spain". */
function cityFromAddress(address) {
  const m = String(address || '').match(/\b\d{5}\s+([^,]+)/);
  return m ? m[1].trim() : null;
}

async function fetchJson(fetchImpl, url, init) {
  try {
    const res = await fetchImpl(url, init);
    if (!res || typeof res.json !== 'function') return null;
    if (res.ok === false) return null;
    if (typeof res.status === 'number' && (res.status < 200 || res.status >= 300)) return null;
    return await res.json();
  } catch {
    /* A DNS failure, an abort, a body that is not JSON: all the same answer. */
    return null;
  }
}

async function googleSearch({ merchant, city, country, key, fetchImpl, bias }) {
  const body = {
    /* The only fields that leave: the name, the city, the country. */
    textQuery: [merchant, city].filter(Boolean).join(', '),
    languageCode: 'es',
    maxResultCount: 1,
  };
  if (String(country || '').toUpperCase() === 'ES') body.regionCode = 'ES';
  /* A bias needs coordinates, and the bank prints a city name. A caller that already
     knows where the person lives passes one; otherwise the city in the query is it. */
  if (bias && Number.isFinite(Number(bias.lat)) && Number.isFinite(Number(bias.lon))) {
    body.locationBias = {
      circle: {
        center: { latitude: Number(bias.lat), longitude: Number(bias.lon) },
        radius: Number(bias.radiusMeters) || 20000,
      },
    };
  }

  const data = await fetchJson(fetchImpl, GOOGLE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': GOOGLE_FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  const hit = Array.isArray(data?.places) ? data.places[0] : null;
  if (!hit) return null;
  const lat = Number(hit.location?.latitude);
  const lon = Number(hit.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const display = hit.displayName?.text || hit.displayName || null;
  const asked = normalize(merchant);
  const got = normalize(display);
  /* Close means the place answers to the name on the statement: the same name, or a
     longer official name that starts with it ("Mercadona" / "Mercadona Alcobendas").
     Anything else is a guess Google made from the words, and 0.6 says so. */
  const close = Boolean(got) && (got === asked || got.startsWith(`${asked} `) || asked.startsWith(`${got} `));

  return {
    name: display || merchant,
    kind: googleKind(hit.types, hit.primaryType),
    category: categoryFromGoogleTypes(hit.types, hit.primaryType),
    lat,
    lon,
    city: city || cityFromAddress(hit.formattedAddress),
    country: country || null,
    provider: PROVIDER_GOOGLE,
    provider_place_id: hit.id || null,
    confidence: close ? 0.9 : 0.6,
    raw: hit,
  };
}

async function nominatimSearch({ merchant, city, country, fetchImpl, now, sleepImpl }) {
  const params = new URLSearchParams({
    q: [merchant, city, country].filter(Boolean).join(', '),
    format: 'jsonv2',
    limit: '1',
    addressdetails: '1',
    extratags: '1',
  });
  const url = `${NOMINATIM_URL}?${params.toString()}`;

  await throttleNominatim(now, sleepImpl);
  const rows = await fetchJson(fetchImpl, url, {
    headers: { 'User-Agent': NOMINATIM_USER_AGENT, 'Accept-Language': 'es' },
  });

  const hit = Array.isArray(rows) ? rows[0] : null;
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const address = hit.address || {};
  return {
    name: hit.name || address.shop || hit.display_name?.split(',')[0] || merchant,
    kind: osmKind(hit.class, hit.type),
    category: categoryFromOsm(hit),
    lat,
    lon,
    city: city || address.city || address.town || address.village || address.municipality || null,
    country: country || (address.country_code ? address.country_code.toUpperCase() : null),
    provider: PROVIDER_NOMINATIM,
    provider_place_id: hit.osm_type && hit.osm_id ? `${hit.osm_type}/${hit.osm_id}` : (hit.place_id ? String(hit.place_id) : null),
    /* One free-text hit out of OpenStreetMap is a reasonable guess and never more:
       the name matched something, and nothing checked it was this branch. */
    confidence: 0.5,
    raw: hit,
  };
}

/**
 * The merchant name, plus the city the bank printed when there is one, resolved to a
 * place. Returns null when nothing matches, when the body is unusable, or when the
 * process is configured not to look anything up.
 *
 * Only `name`, `city` and `country` are read off the options; the rest are seams for
 * tests and callers (`fetchImpl`, `now`, `sleepImpl`, `env`, `bias`). Nothing else a
 * caller passes is forwarded anywhere.
 */
export async function lookupPlace({
  name,
  city = null,
  country = 'ES',
  fetchImpl = fetch,
  now = Date.now,
  env = process.env,
  bias = null,
  sleepImpl = sleep,
} = {}) {
  const merchant = cleanName(name);
  if (!merchant) return null;

  if (looksOnline(merchant)) {
    /* Decided here, with no request: an online brand has no coordinates to fetch and
       asking would spend a call to be told about an office. */
    return {
      name: merchant,
      kind: 'online',
      category: onlineCategory(merchant),
      lat: null,
      lon: null,
      city: null,
      country: null,
      provider: PROVIDER_NONE,
      provider_place_id: null,
      confidence: 1,
      raw: null,
    };
  }

  const provider = providerFor(env);
  if (provider === PROVIDER_NONE) return null;

  const town = city ? cleanName(city) : null;
  const found = provider === PROVIDER_GOOGLE
    ? await googleSearch({ merchant, city: town, country, key: env.GOOGLE_PLACES_API_KEY, fetchImpl, bias })
    : await nominatimSearch({ merchant, city: town, country, fetchImpl, now, sleepImpl });
  if (!found) return null;

  const confidence = looksTruncated(merchant)
    ? Math.min(found.confidence, TRUNCATED_CONFIDENCE)
    : found.confidence;
  return { ...found, confidence };
}

/**
 * One phrase for the UI: "supermarket in Madrid", "train station in Madrid",
 * "online". The kind first, because it is what the person is reading for, and the
 * category as a fallback when the provider named no kind.
 */
export function describePlace(place) {
  if (!place) return null;
  if (place.kind === 'online') return 'online';
  const kind = place.kind || place.category || 'place';
  return place.city ? `${kind} in ${place.city}` : kind;
}

/* ------------------------------------------------------------------------- *
 * Brands a geocoder gets wrong
 * ------------------------------------------------------------------------- *
 * A geocoder answers "is there a thing by this name at this place". It has no idea that
 * Cabify is a ride, that Metro de Madrid is a train, or that OpenRouter is an API bill,
 * and a free provider files all three under nothing. Read against a real ledger, the
 * geocoder placed nineteen merchants of thirty-eight and put El Corte Inglés, Carrefour,
 * Cabify and Metro de Madrid in "other".
 *
 * So the brands a person actually pays are named here: deterministic, free, no request,
 * and better than any provider on exactly the names that repeat every month. The caller
 * lets this win over the provider's category and still keeps the provider's coordinates.
 * Spanish retail, transport and delivery first, because that is whose ledger this is.
 */
const BRANDS = [
  [/^(mercadona|carrefour|lidl|aldi|dia|alcampo|simply|eroski|consum|supercor|ahorramas|hipercor|condis|bonarea|masymas)\b/i, { category: 'groceries', kind: 'supermarket' }],
  [/^(el corte ingl|zara|mango|bershka|pull ?& ?bear|stradivarius|massimo dutti|h ?& ?m|primark|uniqlo|springfield|cortefiel)/i, { category: 'clothing', kind: 'department_store' }],
  [/^(decathlon|forum sport|jd sports|nike|adidas|padel|playtomic|wellness|basic ?fit|altafit|anytime fitness|virgin active|gymage)/i, { category: 'sport', kind: 'sport' }],
  [/^(cabify|uber|bolt|free ?now|taxi|radio ?taxi|pidetaxi|we taxi|licencia)/i, { category: 'taxi', kind: 'ride' }],
  [/^(metro de madrid|renfe|emt|crtm|adif|alsa|avanza|interbus|blablacar|iberia|vueling|ryanair|air europa|easyjet)/i, { category: 'transport', kind: 'transport' }],
  [/^(repsol|cepsa|galp|shell|bp |ballenoil|petroprix)/i, { category: 'fuel', kind: 'fuel' }],
  [/^(glovo|just ?eat|uber ?eats|deliveroo|telepizza|dominos|domino.s|goiko|vips|foster|mcdonald|burger king|kfc|taco bell|starbucks|rodilla|pans|oakberry|shake shack)/i, { category: 'eating out', kind: 'food' }],
  [/^(farmacia|farmacias|pharmacy|dosfarma|promofarma)/i, { category: 'pharmacy', kind: 'pharmacy' }],
  [/^(sanitas|adeslas|dkv|asisa|quiron|vithas|hm hospitales|clinica|dentix|vitaldent)/i, { category: 'health', kind: 'health' }],
  [/^(ie |ie business|torre ie|iese|esade|comillas|icade|uam|ucm|upm|uc3m|urjc|universidad|colegio|coursera|udemy|platzi|duolingo)/i, { category: 'education', kind: 'education' }],
  [/^(openrouter|openai|anthropic|elevenlabs|higgsfield|replicate|hugging ?face|midjourney|runway|fal\.|cursor|github|gitlab|vercel|render|fly\.io|railway|heroku|supabase|planetscale|neon|cloudflare|digitalocean|aws|amazon web|azure|google cloud|gcp|twilio|sendgrid|resend|stripe|linear|notion|figma|slack|zoom|adobe|jetbrains|sentry|posthog|datadog|expo|apple developer|namecheap|godaddy|porkbun)/i, { category: 'software', kind: 'online' }],
  [/^(spotify|netflix|hbo|max\b|disney|prime video|movistar|dazn|filmin|youtube|twitch|steam|playstation|xbox|nintendo|audible|kindle)/i, { category: 'entertainment', kind: 'online' }],
  [/^(booking|airbnb|hotel|hostel|nh hoteles|melia|barcelo|riu|paradores|expedia|kiwi\.com|skyscanner|edreams)/i, { category: 'lodging', kind: 'lodging' }],
  [/^(ikea|leroy merlin|bricomart|bricodepot|maisons du monde|casa|conforama|jysk|action|tiger|flying tiger)/i, { category: 'home', kind: 'home' }],
  [/^(mediamarkt|media markt|worten|pccomponentes|fnac|apple store|xiaomi|samsung)/i, { category: 'electronics', kind: 'electronics' }],
  [/^(bizum|transferencia|traspaso)/i, { category: 'transfers', kind: 'transfer' }],
  [/^(cajero|reintegro|atm)/i, { category: 'cash', kind: 'cash' }],
  [/^(comision|comisión|liquidacion|liquidación|intereses|bank fee|account settlement)/i, { category: 'fees', kind: 'bank' }],
];

/**
 * The category a brand's name settles on its own, or null when the name is not a brand
 * this knows. Matched on the start of the name, because the bank prints the brand first
 * and truncates the rest ("EL CORTE INGLES" but also "El Corte Ingl").
 */
export function categoryFromBrand(name) {
  const n = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (!n) return null;
  for (const [pattern, value] of BRANDS) {
    if (pattern.test(n)) return { ...value, source: 'brand' };
  }
  return null;
}
