// @tem/places — server-side Google Places (New) + Routes helpers (docs/ADDRESS-AUTOCOMPLETE.md, BOOKING-V2-PLAN).
// Server only: API keys are passed in by the caller and never reach the browser.
// Billing: one Places session per address field. Routes results are cached (memory 15 min + optional DB 24 h).

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS_URL = 'https://places.googleapis.com/v1/places/';
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const DETAILS_FIELDS = 'id,formattedAddress,location';
const ROUTES_FIELD_MASK = 'routes.distanceMeters,routes.duration';
const TIMEOUT_MS = 3000;
const ROUTE_MEMORY_TTL_MS = 15 * 60 * 1000;
const ROUTE_DB_TTL_SECONDS = 24 * 60 * 60;

/** Loose Greece box, the same as the database check in migration 0021. */
export const GREECE = { minLat: 34, maxLat: 42, minLng: 19, maxLng: 30.5 };
/** Default bias: central Athens, 50 km. Override per deployment with PLACES_BIAS_LAT / _LNG / _RADIUS_M. */
export const DEFAULT_BIAS = { lat: 37.9838, lng: 23.7275, radiusM: 50000 };
/** Prefer airports, ports and hotels first when distance pricing is on. */
export const PREFERRED_PLACE_TYPES = ['airport', 'ferry_terminal', 'lodging'];
export const MIN_INPUT = 3;
export const MAX_INPUT = 120;
export const MAX_SUGGESTIONS = 5;

export class PlacesError extends Error {
  /** @param {'invalid_request'|'places_unavailable'|'outside_area'} code */
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

export class RouteUnavailable extends Error {
  constructor(message = 'We couldn\'t calculate this route. Try again or contact us.') {
    super(message);
    this.name = 'RouteUnavailable';
    this.code = 'route_unavailable';
  }
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLACE_ID = /^[A-Za-z0-9_-]{10,255}$/;

export const isValidSessionToken = (t) => typeof t === 'string' && UUID_V4.test(t);
export const isValidPlaceId = (id) => typeof id === 'string' && PLACE_ID.test(id);
export const inGreece = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= GREECE.minLat &&
  lat <= GREECE.maxLat &&
  lng >= GREECE.minLng &&
  lng <= GREECE.maxLng;

/** Trims and checks the typed text. Returns null when too short to search (the UI shows nothing). */
export function cleanInput(input) {
  if (typeof input !== 'string') throw new PlacesError('invalid_request', 'input must be text');
  const s = input.replace(/\s+/g, ' ').trim();
  if (s.length > MAX_INPUT) throw new PlacesError('invalid_request', 'input too long');
  return s.length < MIN_INPUT ? null : s;
}

async function call(fetchImpl, url, init) {
  let res;
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new PlacesError('places_unavailable', 'Google Places did not answer');
  }
  if (!res.ok) {
    // Status only — never forward Google error bodies (may echo request metadata).
    throw new PlacesError('places_unavailable', `Google Places answered ${res.status}`);
  }
  return res.json();
}

function mapSuggestions(data) {
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p) => p && isValidPlaceId(p.placeId))
    .slice(0, MAX_SUGGESTIONS)
    .map((p) => ({
      placeId: p.placeId,
      label: p.text?.text ?? '',
      main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      secondary: p.structuredFormat?.secondaryText?.text ?? '',
    }));
}

/**
 * Suggestions for the typed text.
 * @param {{
 *   input: string,
 *   sessionToken: string,
 *   apiKey: string,
 *   language?: string,
 *   bias?: {lat:number,lng:number,radiusM:number},
 *   locationRestriction?: { low: { latitude: number, longitude: number }, high: { latitude: number, longitude: number } },
 *   preferPrimaryTypes?: string[],
 *   fetch?: typeof fetch,
 * }} o
 * @returns {Promise<Array<{ placeId: string, label: string, main: string, secondary: string }>>}
 */
export async function autocomplete(o) {
  if (!o.apiKey) throw new PlacesError('places_unavailable', 'no API key configured');
  if (!isValidSessionToken(o.sessionToken)) throw new PlacesError('invalid_request', 'bad session token');
  const input = cleanInput(o.input);
  if (!input) return [];

  /** @type {Record<string, unknown>} */
  const body = {
    input,
    sessionToken: o.sessionToken,
    includedRegionCodes: ['gr'],
    languageCode: o.language ?? 'en',
  };

  if (o.locationRestriction) {
    body.locationRestriction = { rectangle: o.locationRestriction };
  } else {
    const bias = o.bias ?? DEFAULT_BIAS;
    body.locationBias = {
      circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: bias.radiusM },
    };
  }

  const fetchImpl = o.fetch ?? fetch;
  const headers = { 'Content-Type': 'application/json', 'X-Goog-Api-Key': o.apiKey };

  const run = async (extra) =>
    call(fetchImpl, AUTOCOMPLETE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, ...extra }),
    });

  const types = o.preferPrimaryTypes;
  if (Array.isArray(types) && types.length > 0) {
    try {
      const preferred = mapSuggestions(await run({ includedPrimaryTypes: types }));
      if (preferred.length) return preferred;
    } catch {
      // Fall through to an unrestricted-types request.
    }
  }

  return mapSuggestions(await run({}));
}

/**
 * Ends the session: address and coordinates of the chosen suggestion (Place Details Essentials).
 * @param {{ placeId: string, sessionToken: string, apiKey: string, language?: string, fetch?: typeof fetch }} o
 * @returns {Promise<{ placeId: string, address: string, lat: number, lng: number }>}
 */
export async function placeDetails(o) {
  if (!o.apiKey) throw new PlacesError('places_unavailable', 'no API key configured');
  if (!isValidPlaceId(o.placeId)) throw new PlacesError('invalid_request', 'bad place id');
  if (!isValidSessionToken(o.sessionToken)) throw new PlacesError('invalid_request', 'bad session token');
  const url = `${DETAILS_URL}${encodeURIComponent(o.placeId)}?sessionToken=${encodeURIComponent(o.sessionToken)}&languageCode=${encodeURIComponent(o.language ?? 'en')}`;
  const data = await call(o.fetch ?? fetch, url, {
    method: 'GET',
    headers: { 'X-Goog-Api-Key': o.apiKey, 'X-Goog-FieldMask': DETAILS_FIELDS },
  });
  const lat = data.location?.latitude;
  const lng = data.location?.longitude;
  if (!isValidPlaceId(data.id) || typeof data.formattedAddress !== 'string' || !inGreece(lat, lng)) {
    throw new PlacesError('outside_area', 'place is not usable for a booking');
  }
  return { placeId: data.id, address: data.formattedAddress, lat, lng };
}

/**
 * Validates the optional place object a form sends with an address ({ placeId, lat, lng }).
 * Returns null when absent (typed address). Throws invalid_request when present but wrong.
 */
export function parsePlace(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object') throw new PlacesError('invalid_request', 'place must be an object');
  const { placeId, lat, lng } = value;
  if (!isValidPlaceId(placeId) || !inGreece(Number(lat), Number(lng)))
    throw new PlacesError('invalid_request', 'bad place');
  return { placeId, lat: Number(lat), lng: Number(lng) };
}

/** Database columns for a parsed place (migration 0021). prefix: 'pickup' | 'dropoff'. */
export function placeColumns(prefix, place) {
  return place
    ? { [`${prefix}_place_id`]: place.placeId, [`${prefix}_lat`]: place.lat, [`${prefix}_lng`]: place.lng }
    : { [`${prefix}_place_id`]: null, [`${prefix}_lat`]: null, [`${prefix}_lng`]: null };
}

/**
 * Google Maps directions link (Maps URLs: free, no API key). With a place, it opens the exact place;
 * without, it searches the typed address.
 */
export function mapsDirectionsUrl({ address, placeId, lat, lng }) {
  const p = new URLSearchParams({ api: '1', travelmode: 'driving' });
  if (placeId && Number.isFinite(lat) && Number.isFinite(lng)) {
    p.set('destination', `${lat},${lng}`);
    p.set('destination_place_id', placeId);
  } else {
    p.set('destination', String(address ?? '').trim());
  }
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

/** Text for a form submission answer (Sanity): the address plus a Maps link when a place was picked. */
export function addressAnswer(address, place) {
  return place ? `${address}\nGoogle Maps: ${mapsDirectionsUrl({ address, ...place })}` : address;
}

// --- Google Routes (distance pricing) -----------------------------------------------------------

/** @type {Map<string, { value: { distanceKm: number, durationMin: number, source: 'google' }, exp: number }>} */
const routeMemory = new Map();

/** Round coordinates to 5 decimals for cache keys. */
export function roundCoord(n) {
  return Number(Number(n).toFixed(5));
}

/** Round a Date / ISO string down to the nearest 15 minutes (UTC). */
export function roundDepartAt(departAt) {
  if (!departAt) return '';
  const d = departAt instanceof Date ? new Date(departAt.getTime()) : new Date(departAt);
  if (!Number.isFinite(d.getTime())) return '';
  const ms = 15 * 60 * 1000;
  d.setTime(Math.floor(d.getTime() / ms) * ms);
  return d.toISOString();
}

/**
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @param {{ lat: number, lng: number }[]} [stops]
 * @param {string | Date | null | undefined} [departAt]
 */
export function routeCacheKey(origin, destination, stops = [], departAt) {
  const pt = (p) => `${roundCoord(p.lat)},${roundCoord(p.lng)}`;
  return [pt(origin), pt(destination), stops.map(pt).join(';'), roundDepartAt(departAt)].join('|');
}

export function __resetRouteCacheForTests() {
  routeMemory.clear();
}

function latLngBody(p) {
  return { location: { latLng: { latitude: p.lat, longitude: p.lng } } };
}

/**
 * Drive distance and duration via Google Routes API (server only).
 * @param {{
 *   origin: { lat: number, lng: number },
 *   destination: { lat: number, lng: number },
 *   stops?: { lat: number, lng: number }[],
 *   departAt?: string | Date | null,
 *   apiKey: string,
 *   fetch?: typeof fetch,
 *   dbCache?: {
 *     get: (key: string) => Promise<{ distanceKm: number, durationMin: number, source: string } | null>,
 *     set: (key: string, value: { distanceKm: number, durationMin: number, source: string }, ttlSeconds: number) => Promise<void>,
 *   },
 * }} o
 * @returns {Promise<{ distanceKm: number, durationMin: number, source: 'google' }>}
 */
export async function route(o) {
  if (!o?.apiKey) throw new RouteUnavailable('no API key configured');
  if (!o.origin || !o.destination) throw new RouteUnavailable('origin and destination required');
  const stops = Array.isArray(o.stops) ? o.stops : [];
  const key = routeCacheKey(o.origin, o.destination, stops, o.departAt);

  const mem = routeMemory.get(key);
  if (mem && mem.exp > Date.now()) return mem.value;

  if (o.dbCache) {
    try {
      const hit = await o.dbCache.get(key);
      if (hit && Number.isFinite(hit.distanceKm) && Number.isFinite(hit.durationMin)) {
        const value = {
          distanceKm: hit.distanceKm,
          durationMin: hit.durationMin,
          source: 'google',
        };
        routeMemory.set(key, { value, exp: Date.now() + ROUTE_MEMORY_TTL_MS });
        return value;
      }
    } catch {
      // DB cache is best-effort; fall through to Google.
    }
  }

  /** @type {Record<string, unknown>} */
  const body = {
    origin: latLngBody(o.origin),
    destination: latLngBody(o.destination),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
  };
  if (stops.length) {
    body.intermediates = stops.map(latLngBody);
  }
  if (o.departAt) {
    const dep = o.departAt instanceof Date ? o.departAt : new Date(o.departAt);
    if (Number.isFinite(dep.getTime()) && dep.getTime() > Date.now()) {
      body.departureTime = dep.toISOString();
    }
  }

  const fetchImpl = o.fetch ?? fetch;
  const init = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': o.apiKey,
      'X-Goog-FieldMask': ROUTES_FIELD_MASK,
    },
    body: JSON.stringify(body),
  };

  let data;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchImpl(ROUTES_URL, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`status ${res.status}`);
      data = await res.json();
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr || !data) throw new RouteUnavailable();

  const r0 = data.routes?.[0];
  const meters = r0?.distanceMeters;
  const duration = r0?.duration; // e.g. "1234s"
  if (!Number.isFinite(meters) || typeof duration !== 'string') throw new RouteUnavailable();
  const seconds = Number(duration.replace(/s$/i, ''));
  if (!Number.isFinite(seconds) || seconds < 0) throw new RouteUnavailable();

  const value = {
    distanceKm: Math.round(meters / 100) / 10, // 1 decimal
    durationMin: Math.ceil(seconds / 60),
    source: /** @type {'google'} */ ('google'),
  };

  routeMemory.set(key, { value, exp: Date.now() + ROUTE_MEMORY_TTL_MS });
  if (o.dbCache) {
    try {
      await o.dbCache.set(key, value, ROUTE_DB_TTL_SECONDS);
    } catch {
      // ignore
    }
  }
  return value;
}
