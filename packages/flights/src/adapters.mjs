import { compactFlightNumber, normalizeFlightNumber } from './normalize.mjs';
import { parseAerodatabox, parseFlightaware, parseManual } from './parse.mjs';

/**
 * @typedef {{ number: string, date: string }} LookupInput  date = YYYY-MM-DD
 * @typedef {import('./parse.mjs').FlightLookup} FlightLookup
 */

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`flight_provider_http_${res.status}`);
    err.status = res.status;
    err.body = text.slice(0, 200);
    throw err;
  }
  return res.json();
}

export function createAerodataboxAdapter({ apiKey, fetchImpl = fetchJson } = {}) {
  if (!apiKey) throw new Error('FLIGHT_PROVIDER_KEY required for aerodatabox');
  return {
    name: 'aerodatabox',
    /** @param {LookupInput} input */
    async lookup(input) {
      const num = compactFlightNumber(input.number);
      const date = input.date;
      const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(num)}/${encodeURIComponent(date)}`;
      const body = await fetchImpl(url, {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
        Accept: 'application/json',
      });
      return parseAerodatabox(body);
    },
  };
}

export function createFlightawareAdapter({ apiKey, fetchImpl = fetchJson } = {}) {
  if (!apiKey) throw new Error('FLIGHT_PROVIDER_KEY required for flightaware');
  return {
    name: 'flightaware',
    /** @param {LookupInput} input */
    async lookup(input) {
      const ident = compactFlightNumber(input.number);
      const start = `${input.date}T00:00:00Z`;
      const endDate = new Date(`${input.date}T00:00:00Z`);
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      const end = endDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
      const url =
        `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ident)}` +
        `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&max_pages=1`;
      const body = await fetchImpl(url, {
        'x-apikey': apiKey,
        Accept: 'application/json',
      });
      return parseFlightaware(body, input.date);
    },
  };
}

export function createManualAdapter() {
  return {
    name: 'manual',
    async lookup() {
      return parseManual();
    },
  };
}

/**
 * @param {{ provider?: string, apiKey?: string, fetchImpl?: typeof fetchJson }} [opts]
 */
export function createFlightProvider(opts = {}) {
  const provider = (opts.provider || process.env.FLIGHT_PROVIDER || 'manual').toLowerCase();
  const apiKey = opts.apiKey ?? process.env.FLIGHT_PROVIDER_KEY;
  if (provider === 'aerodatabox') return createAerodataboxAdapter({ apiKey, fetchImpl: opts.fetchImpl });
  if (provider === 'flightaware') return createFlightawareAdapter({ apiKey, fetchImpl: opts.fetchImpl });
  if (provider === 'manual') return createManualAdapter();
  throw new Error(`unknown FLIGHT_PROVIDER: ${provider}`);
}

export { normalizeFlightNumber, compactFlightNumber };
