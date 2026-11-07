/**
 * Provider response → normalised lookup result. Keep parsing here with fixtures.
 * @typedef {{ found: boolean, airline?: string|null, origin?: string|null, originCountry?: string|null, schedArr?: string|null, eta?: string|null, status?: string, terminal?: string|null, raw?: unknown }} FlightLookup
 */

const ADB_STATUS = {
  0: 'unknown',
  1: 'scheduled',
  2: 'scheduled',
  3: 'scheduled',
  4: 'scheduled',
  5: 'scheduled',
  6: 'scheduled',
  7: 'delayed',
  8: 'scheduled',
  9: 'landed',
  10: 'cancelled',
  11: 'diverted',
  12: 'cancelled',
};

const FA_STATUS = {
  Scheduled: 'scheduled',
  'Filed': 'scheduled',
  'En Route': 'scheduled',
  'Enroute': 'scheduled',
  Delayed: 'delayed',
  Arrived: 'landed',
  Landed: 'landed',
  Cancelled: 'cancelled',
  Diverted: 'diverted',
};

function isoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/**
 * AeroDataBox Flight status (nearest day) — array of flights.
 * @param {unknown} body
 * @returns {import('./parse.mjs').FlightLookup}
 */
export function parseAerodatabox(body) {
  const list = Array.isArray(body) ? body : body?.items ?? body?.flights;
  if (!Array.isArray(list) || !list.length) {
    return { found: false, status: 'unknown', raw: body };
  }
  const f = list[0];
  const arrival = f.arrival || {};
  const departure = f.departure || {};
  const statusCode = typeof f.status === 'number' ? f.status : null;
  const status =
    (statusCode != null && ADB_STATUS[statusCode]) ||
    (typeof f.status === 'string' ? FA_STATUS[f.status] || 'unknown' : 'unknown');
  const sched =
    arrival.scheduledTime?.utc ||
    arrival.scheduledTimeUtc ||
    arrival.scheduledTimeLocal ||
    null;
  const eta =
    arrival.revisedTime?.utc ||
    arrival.predictedTime?.utc ||
    arrival.actualTime?.utc ||
    arrival.actualTimeUtc ||
    arrival.revisedTimeUtc ||
    sched;
  return {
    found: true,
    airline: f.airline?.name || f.airline?.iata || f.airline?.icao || null,
    origin: departure.airport?.iata || departure.airport?.icao || null,
    originCountry: departure.airport?.countryCode || departure.airport?.country?.code || null,
    schedArr: isoOrNull(sched),
    eta: isoOrNull(eta),
    status,
    terminal: arrival.terminal || null,
    raw: f,
  };
}

/**
 * FlightAware AeroAPI GET /flights/{ident} — { flights: [...] }.
 * @param {unknown} body
 * @param {string} [dateYmd] filter to local date when several flights returned
 */
export function parseFlightaware(body, dateYmd) {
  const list = Array.isArray(body?.flights) ? body.flights : Array.isArray(body) ? body : [];
  if (!list.length) return { found: false, status: 'unknown', raw: body };

  let f = list[0];
  if (dateYmd) {
    const match = list.find((row) => {
      const on = row.scheduled_on || row.scheduled_in || row.estimated_on || row.scheduled_out;
      return on && String(on).slice(0, 10) === dateYmd;
    });
    if (match) f = match;
  }

  const statusRaw = f.status || f.flight_status || '';
  const status = FA_STATUS[statusRaw] || (String(statusRaw).toLowerCase().includes('cancel')
    ? 'cancelled'
    : String(statusRaw).toLowerCase().includes('divert')
      ? 'diverted'
      : String(statusRaw).toLowerCase().includes('delay')
        ? 'delayed'
        : String(statusRaw).toLowerCase().includes('arriv') || String(statusRaw).toLowerCase().includes('land')
          ? 'landed'
          : 'scheduled');

  const sched = f.scheduled_on || f.scheduled_in || f.scheduled_off || null;
  const eta = f.estimated_on || f.estimated_in || f.actual_on || f.actual_in || sched;

  return {
    found: true,
    airline: f.operator || f.operator_iata || f.ident_iata?.slice(0, 2) || null,
    origin: f.origin?.code_iata || f.origin?.code || f.origin?.code_icao || null,
    originCountry: f.origin?.timezone?.includes('/') ? null : f.origin?.country || null,
    schedArr: isoOrNull(sched),
    eta: isoOrNull(eta),
    status,
    terminal: f.terminal_destination || f.gate_destination || null,
    raw: f,
  };
}

export function parseManual() {
  return {
    found: true,
    airline: null,
    origin: null,
    originCountry: null,
    schedArr: null,
    eta: null,
    status: 'unknown',
    terminal: null,
    raw: { provider: 'manual' },
  };
}
