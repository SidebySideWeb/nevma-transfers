/**
 * Pure helpers for the flight cron (no I/O).
 */

/** Greece (and common EU domestic for LGAV arrivals). */
const DOMESTIC_COUNTRIES = new Set(['GR', 'GRE', 'GREECE', 'EL']);

/**
 * Buffer minutes after arrival for pick-up suggestion.
 * @param {string|null|undefined} originCountry
 * @param {{ domestic?: number, international?: number }} [buffers]
 */
export function pickupBufferMin(originCountry, buffers = {}) {
  const domestic = buffers.domestic ?? 15;
  const international = buffers.international ?? 30;
  const code = (originCountry || '').toUpperCase().trim();
  if (code && DOMESTIC_COUNTRIES.has(code)) return domestic;
  // Unknown origin → international buffer (safer for Attica airport meets).
  return international;
}

/**
 * Suggested pick-up instant = arrival + buffer.
 * @param {string|Date} arrivalIso
 * @param {number} bufferMin
 */
export function suggestedPickupAt(arrivalIso, bufferMin) {
  const t = new Date(arrivalIso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + Math.max(0, bufferMin) * 60_000);
}

/**
 * Should we poll this booking now?
 * - skip if no flight / landed / cancelled booking states handled by caller
 * - every 30 min until 3 h before arrival (sched or eta)
 * - every 10 min in the last 3 h
 * - stop when status is landed
 *
 * @param {{ flightStatus?: string|null, arrivalAt: Date|string|null, lastCheckedAt?: Date|string|null, now?: Date }} input
 */
export function shouldPollFlight(input) {
  const status = (input.flightStatus || '').toLowerCase();
  if (status === 'landed') return { poll: false, reason: 'landed' };
  if (!input.arrivalAt) return { poll: false, reason: 'no_arrival' };

  const now = (input.now || new Date()).getTime();
  const arrival = new Date(input.arrivalAt).getTime();
  if (!Number.isFinite(arrival)) return { poll: false, reason: 'bad_arrival' };

  const msToArrival = arrival - now;
  const intervalMs = msToArrival > 3 * 3600_000 ? 30 * 60_000 : 10 * 60_000;

  const last = input.lastCheckedAt ? new Date(input.lastCheckedAt).getTime() : 0;
  if (last && now - last < intervalMs - 5_000) {
    return { poll: false, reason: 'interval', intervalMin: intervalMs / 60_000 };
  }
  return { poll: true, intervalMin: intervalMs / 60_000 };
}

/**
 * ETA moved enough to shift pick-up?
 * @param {string|Date|null|undefined} prevEta
 * @param {string|Date|null|undefined} nextEta
 * @param {number} [thresholdMin]
 */
export function etaMovedEnough(prevEta, nextEta, thresholdMin = 15) {
  if (!nextEta) return false;
  if (!prevEta) return true;
  const a = new Date(prevEta).getTime();
  const b = new Date(nextEta).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(b - a) >= thresholdMin * 60_000;
}
