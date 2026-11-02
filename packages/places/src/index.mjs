// @tem/places — server-side Google Places (New) helpers for address autocomplete (docs/ADDRESS-AUTOCOMPLETE.md).
// Server only: the API key is passed in by the caller from a server environment variable and never reaches the browser.
// Billing: one session per address field. Autocomplete calls carry the session token; the session ends with ONE
// Place Details call asking only id, formattedAddress, location (Place Details Essentials, the cheapest details SKU).
// Nothing here logs the user's input or the returned address (they can be personal data).

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS_URL = 'https://places.googleapis.com/v1/places/';
const DETAILS_FIELDS = 'id,formattedAddress,location';
const TIMEOUT_MS = 3000;

/** Loose Greece box, the same as the database check in migration 0021. */
export const GREECE = { minLat: 34, maxLat: 42, minLng: 19, maxLng: 30.5 };
/** Default bias: central Athens, 50 km. Override per deployment with PLACES_BIAS_LAT / _LNG / _RADIUS_M. */
export const DEFAULT_BIAS = { lat: 37.9838, lng: 23.7275, radiusM: 50000 };
export const MIN_INPUT = 3;
export const MAX_INPUT = 120;
export const MAX_SUGGESTIONS = 5;

export class PlacesError extends Error {
  /** @param {'invalid_request'|'places_unavailable'|'outside_area'} code */
  constructor(code, message = code) { super(message); this.code = code; }
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLACE_ID = /^[A-Za-z0-9_-]{10,255}$/;

export const isValidSessionToken = (t) => typeof t === 'string' && UUID_V4.test(t);
export const isValidPlaceId = (id) => typeof id === 'string' && PLACE_ID.test(id);
export const inGreece = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= GREECE.minLat && lat <= GREECE.maxLat && lng >= GREECE.minLng && lng <= GREECE.maxLng;

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

/**
 * Suggestions for the typed text.
 * @param {{ input: string, sessionToken: string, apiKey: string, language?: string, bias?: {lat:number,lng:number,radiusM:number}, fetch?: typeof fetch }} o
 * @returns {Promise<Array<{ placeId: string, label: string, main: string, secondary: string }>>}
 */
export async function autocomplete(o) {
  if (!o.apiKey) throw new PlacesError('places_unavailable', 'no API key configured');
  if (!isValidSessionToken(o.sessionToken)) throw new PlacesError('invalid_request', 'bad session token');
  const input = cleanInput(o.input);
  if (!input) return [];
  const bias = o.bias ?? DEFAULT_BIAS;
  const body = {
    input,
    sessionToken: o.sessionToken,
    includedRegionCodes: ['gr'],
    languageCode: o.language ?? 'en',
    locationBias: { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: bias.radiusM } },
  };
  const data = await call(o.fetch ?? fetch, AUTOCOMPLETE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': o.apiKey },
    body: JSON.stringify(body),
  });
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
  if (!isValidPlaceId(placeId) || !inGreece(Number(lat), Number(lng))) throw new PlacesError('invalid_request', 'bad place');
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
