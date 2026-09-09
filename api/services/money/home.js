/**
 * Home: where the person lives, read off the ledger and confirmed on a map.
 * =========================================================================
 * Nobody should have to type their district. The everyday shops a person pays at on many
 * different days (the supermarket, the pharmacy, the bakery, the metro) cluster around where
 * they sleep, and the densest cluster of those is a good first guess. The guess is shown on a
 * map for the person to confirm or replace; only what they confirm is kept.
 *
 * Deterministic throughout. No model. The only outbound calls are to Google's Geocoding,
 * Places and Static Maps APIs with the process's key, which never leaves this server: the
 * map image is proxied, not linked.
 *
 * What is stored: the district and city as words in a `home_area` fact (what every other
 * reader of facts expects), and the point behind them in a `home_point` fact that the facts
 * listing hides (it is working memory for near-home classification, not something the person
 * said). Never an address.
 */

import { supabaseAdmin } from '../database.js';
import { listTransactions, listFacts } from './store.js';
import { describeContext } from './context.js';

export const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
export const STATIC_MAP_URL = 'https://maps.googleapis.com/maps/api/staticmap';
export const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

/** How close two everyday shops must be to count as the same neighbourhood. */
export const CLUSTER_RADIUS_M = 800;
/** The ring drawn on the map around the guess. */
export const RING_RADIUS_M = 600;
export const RING_POINTS = 36;
/** How far back the ledger is read for the guess. */
export const LOOKBACK_DAYS = 90;

/* Categories a person pays at near where they live. Taxis move, travel leaves, software has no
   street. Eating out counts only as a habit: three distinct days at the same place. */
export const EVERYDAY_CATEGORIES = Object.freeze(['groceries', 'pharmacy', 'transport', 'coffee', 'health']);
export const HABIT_CATEGORIES = Object.freeze(['eating out']);
export const HABIT_MIN_DAYS = 3;

/* Google place types that name an area rather than a shop. */
export const AREA_TYPES = Object.freeze([
  'locality', 'sublocality', 'sublocality_level_1', 'sublocality_level_2', 'neighborhood',
  'administrative_area_level_3', 'administrative_area_level_4', 'postal_town',
]);

export const HOME_KIND = 'home_area';
export const POINT_KIND = 'home_point';

/* ------------------------------------------------------------------ geometry */

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** A ring of `points` around a centre, for the map. Closed: the first point repeats last. */
export function circlePolygon({ lat, lng }, radiusM = RING_RADIUS_M, points = RING_POINTS) {
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.max(0.01, Math.cos(rad(lat))));
  const out = [];
  for (let i = 0; i < points; i += 1) {
    const a = (2 * Math.PI * i) / points;
    out.push({ lat: lat + dLat * Math.sin(a), lng: lng + dLng * Math.cos(a) });
  }
  out.push(out[0]);
  return out;
}

/* ------------------------------------------------------------------ the guess */

/**
 * Places with a point and a weight (distinct days paid there), from ledger rows and place rows.
 * Pure: the loaders are separate so this can be tested with fixtures.
 */
export function weighPlaces(transactions, places, { now = new Date() } = {}) {
  const since = now.getTime() - LOOKBACK_DAYS * 86400000;
  const byKey = new Map();
  for (const p of places) {
    if (!Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lon ?? p.lng))) continue;
    byKey.set(p.merchant_key, { ...p, lat: Number(p.lat), lng: Number(p.lon ?? p.lng), category: p.category_override || p.category || null });
  }
  const days = new Map();
  for (const t of transactions) {
    if (!(Number(t.amount) < 0)) continue;
    const at = new Date(t.occurred_at).getTime();
    if (!Number.isFinite(at) || at < since) continue;
    if (!byKey.has(t.merchant_key)) continue;
    if (!days.has(t.merchant_key)) days.set(t.merchant_key, new Set());
    days.get(t.merchant_key).add(t.occurred_at.slice(0, 10));
  }
  const out = [];
  for (const [key, set] of days) {
    const p = byKey.get(key);
    const n = set.size;
    const everyday = EVERYDAY_CATEGORIES.includes(p.category);
    const habit = HABIT_CATEGORIES.includes(p.category) && n >= HABIT_MIN_DAYS;
    if (!everyday && !habit) continue;
    out.push({ merchant_key: key, name: p.name || key, category: p.category, lat: p.lat, lng: p.lng, weight: n });
  }
  return out;
}

/**
 * The densest neighbourhood of everyday places: the point whose 800 m circle holds the most
 * paid days, then the weighted centre of what it holds. Returns null below two places.
 */
export function clusterHome(weighted, { radiusM = CLUSTER_RADIUS_M } = {}) {
  if (weighted.length < 2) return null;
  const total = weighted.reduce((s, p) => s + p.weight, 0);
  /* A neighbourhood is at least two shops. One supermarket paid at often, on its own, is a
     habit, not a home, however many days it carries. */
  let best = null;
  for (const seed of weighted) {
    const members = weighted.filter((p) => distanceM(seed, p) <= radiusM);
    if (members.length < 2) continue;
    const weight = members.reduce((s, p) => s + p.weight, 0);
    if (!best || weight > best.weight || (weight === best.weight && members.length > best.members.length)) {
      best = { seed, members, weight };
    }
  }
  if (!best) return null;
  const lat = best.members.reduce((s, p) => s + p.lat * p.weight, 0) / best.weight;
  const lng = best.members.reduce((s, p) => s + p.lng * p.weight, 0) / best.weight;
  const share = total ? best.weight / total : 0;
  const confidence = best.members.length >= 3 && share >= 0.5 ? 'good' : 'weak';
  const shops = best.members.length;
  const basis = `${best.weight} paid ${best.weight === 1 ? 'day' : 'days'} at ${shops} everyday ${shops === 1 ? 'shop' : 'shops'} within ${radiusM} m of here`;
  return {
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    confidence,
    share: Math.round(share * 100) / 100,
    places: best.members.map((p) => ({ merchant_key: p.merchant_key, name: p.name, category: p.category, days: p.weight })),
    basis,
  };
}

/* ------------------------------------------------------------------ Google */

const geocodeCache = new Map();
const cacheKey = (lat, lng) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

async function fetchJson(fetchImpl, url, init) {
  try {
    const res = await fetchImpl(url, init);
    if (!res || res.ok === false) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** District and city for a point, from the Geocoding API; cached per rounded point. */
export async function reverseGeocode({ lat, lng }, { key = process.env.GOOGLE_PLACES_API_KEY, fetchImpl = fetch } = {}) {
  if (!key) return { district: null, city: null };
  const k = cacheKey(lat, lng);
  if (geocodeCache.has(k)) return geocodeCache.get(k);
  const params = new URLSearchParams({
    latlng: `${lat},${lng}`, key, language: 'es',
    result_type: 'sublocality|neighborhood|locality',
  });
  const data = await fetchJson(fetchImpl, `${GEOCODE_URL}?${params}`);
  const out = pickDistrict(data);
  geocodeCache.set(k, out);
  return out;
}

/** The district and city out of a geocoding answer. Pure. */
export function pickDistrict(data) {
  const results = Array.isArray(data?.results) ? data.results : [];
  let district = null;
  let city = null;
  for (const r of results) {
    for (const c of r.address_components || []) {
      const types = c.types || [];
      if (!district && (types.includes('sublocality_level_1') || types.includes('sublocality') || types.includes('neighborhood'))) district = c.long_name;
      if (!city && types.includes('locality')) city = c.long_name;
    }
  }
  return { district, city };
}

/** Areas in Spain matching what the person typed: districts, towns, neighbourhoods. */
export async function searchAreas(q, { key = process.env.GOOGLE_PLACES_API_KEY, fetchImpl = fetch } = {}) {
  const query = String(q || '').trim();
  if (!key || query.length < 2) return [];
  const data = await fetchJson(fetchImpl, PLACES_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types',
    },
    body: JSON.stringify({ textQuery: query, regionCode: 'ES', languageCode: 'es', maxResultCount: 10 }),
  });
  return filterAreas(Array.isArray(data?.places) ? data.places : []);
}

/** Keep the results that are places to live in, not shops. Pure. */
export function filterAreas(places) {
  const out = [];
  for (const p of places) {
    const types = p.types || [];
    if (!types.some((t) => AREA_TYPES.includes(t))) continue;
    const lat = Number(p.location?.latitude);
    const lng = Number(p.location?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const label = p.displayName?.text || p.displayName || '';
    if (!label) continue;
    const secondary = String(p.formattedAddress || '').replace(/,?\s*(Espa[n\u00f1]a|Spain)\s*$/i, '').trim();
    out.push({ id: p.id || `${lat},${lng}`, label, secondary: secondary === label ? '' : secondary, lat, lng });
    if (out.length === 6) break;
  }
  return out;
}

/** The Static Maps request for a quiet monochrome map with a ring around the point. Pure. */
export function staticMapUrl({ lat, lng, zoom = 14, w = 720, h = 400, scale = 2 }, key) {
  const params = new URLSearchParams({
    center: `${lat},${lng}`, zoom: String(zoom), size: `${w}x${h}`, scale: String(scale),
    maptype: 'roadmap', language: 'es', key,
  });
  const styles = [
    'feature:all|element:geometry|saturation:-100|lightness:20',
    'feature:all|element:labels.text.fill|saturation:-100|lightness:-10',
    'feature:poi|element:labels|visibility:off',
    'feature:poi|element:geometry|visibility:off',
    'feature:transit|visibility:off',
    'feature:water|element:geometry|saturation:-100|lightness:40',
    'feature:road|element:labels|visibility:on',
  ];
  for (const s of styles) params.append('style', s);
  const ring = circlePolygon({ lat, lng }).map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
  params.append('path', `color:0x111111aa|weight:2|${ring}`);
  return `${STATIC_MAP_URL}?${params}`;
}

/** The map image itself, so the key stays here. */
export async function staticMap(opts, { key = process.env.GOOGLE_PLACES_API_KEY, fetchImpl = fetch } = {}) {
  if (!key) return null;
  try {
    const res = await fetchImpl(staticMapUrl(opts, key));
    if (!res || res.ok === false) return null;
    const contentType = (typeof res.headers?.get === 'function' && res.headers.get('content-type')) || 'image/png';
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, contentType };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ loaders */

async function placesForUser(userId, transactions) {
  const keys = [...new Set(transactions.map((t) => t.merchant_key).filter(Boolean))];
  if (!keys.length) return [];
  const { data } = await supabaseAdmin.from('money_places')
    .select('merchant_key, name, category, category_override, lat, lon')
    .in('merchant_key', keys);
  return data || [];
}

/**
 * Where the person probably lives: the cluster, named. Null when the ledger cannot say.
 */
export async function guessHome(userId, { now = new Date(), fetchImpl = fetch, key = process.env.GOOGLE_PLACES_API_KEY } = {}) {
  const transactions = await listTransactions(userId, { since: new Date(now.getTime() - LOOKBACK_DAYS * 86400000).toISOString(), limit: 5000 });
  const places = await placesForUser(userId, transactions);
  const cluster = clusterHome(weighPlaces(transactions, places, { now }));
  if (!cluster) return null;
  const named = await reverseGeocode(cluster, { key, fetchImpl });
  return { ...cluster, district: named.district, city: named.city };
}

/** What has been confirmed: the words and, when there is one, the point. */
export async function savedHome(userId) {
  const facts = await listFacts(userId, { includeInternal: true });
  const area = facts.find((f) => f.kind === HOME_KIND);
  if (!area) return null;
  const point = facts.find((f) => f.kind === POINT_KIND);
  let detail = null;
  if (point?.value) { try { detail = JSON.parse(point.value); } catch { detail = null; } }
  return {
    district: detail?.district || area.value,
    city: detail?.city || null,
    lat: Number.isFinite(Number(detail?.lat)) ? Number(detail.lat) : null,
    lng: Number.isFinite(Number(detail?.lng)) ? Number(detail.lng) : null,
    source: detail?.source || area.source || 'asked',
    value: area.value,
  };
}

/** The words every reader of facts sees for a home. */
export function homeValue({ district, city }) {
  const d = String(district || '').trim();
  /* The city may arrive as a whole address line ("Recoletos, Salamanca, Madrid"). Keep the
     town at the end of it and never repeat the district. */
  const parts = String(city || '').split(',').map((s) => s.trim()).filter(Boolean);
  const c = parts.length ? parts[parts.length - 1] : '';
  if (d && c && d.toLowerCase() !== c.toLowerCase()) return `${d}, ${c}`;
  return d || c;
}

/**
 * Keep a confirmed home: the words as a home_area fact, the point as a hidden home_point fact,
 * and the opening question marked answered. Returns what the ledger will say about it.
 */
export async function saveHome(userId, { district, city, lat, lng, source = 'confirmed' }) {
  const value = homeValue({ district, city });
  if (!value) throw new Error('A home needs a district or a city.');
  const now = new Date().toISOString();
  const area = {
    user_id: userId, kind: HOME_KIND, subject: '', subject_label: null, value,
    amount: null, day: null, share: null, source: source === 'confirmed' ? 'asked' : 'inferred',
    question_id: HOME_KIND, answered_at: now,
  };
  const { error } = await supabaseAdmin.from('money_facts').upsert(area, { onConflict: 'user_id,kind,subject' });
  if (error) throw new Error(error.message);
  const hasPoint = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  if (hasPoint) {
    const point = {
      user_id: userId, kind: POINT_KIND, subject: '', subject_label: null,
      value: JSON.stringify({ lat: Number(lat), lng: Number(lng), district: district || null, city: city || null, source }),
      amount: null, day: null, share: null, source: 'inferred', question_id: null, answered_at: now,
    };
    const { error: e2 } = await supabaseAdmin.from('money_facts').upsert(point, { onConflict: 'user_id,kind,subject' });
    if (e2) throw new Error(e2.message);
  }
  await supabaseAdmin.from('money_questions_asked')
    .upsert({ user_id: userId, question_id: HOME_KIND, answered: true, skipped: false }, { onConflict: 'user_id,question_id' });
  const said = describeContext([{ kind: HOME_KIND, value }]).split('\n').pop().replace(/^- /, '');
  return { value, said: `${said} The shops around it read as near home now.` };
}
