/**
 * Pure helpers for the flight cron (no I/O).
 *
 * Event schedule (per booking, stored as next_flight_check_at):
 *  1. At booking
 *  2. Scheduled arrival − 6 h
 *  3. Scheduled departure + 30 min (skip if within 1 h of check 2)
 *  4. Expected arrival − 60 min
 *  5. Expected arrival + 10 min, only if status isn’t landed
 *
 * After each check, recompute from the latest arrival estimate.
 * Stop at landed or cancelled. Min 30 min between checks (except Check now).
 */

/** Greece (and common EU domestic for LGAV arrivals). */
const DOMESTIC_COUNTRIES = new Set(['GR', 'GRE', 'GREECE', 'EL']);

const HOUR = 3600_000;
const MIN = 60_000;

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

function toMs(v) {
  if (v == null || v === '') return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Planned check points for a flight (sorted). Empty when tracking should stop.
 *
 * @param {{
 *   bookedAt?: Date|string|null,
 *   schedArr?: Date|string|null,
 *   schedDep?: Date|string|null,
 *   eta?: Date|string|null,
 *   status?: string|null,
 *   includeBookingCheck?: boolean,
 * }} input
 * @returns {{ at: Date, kind: string }[]}
 */
export function planFlightChecks(input) {
  const status = (input.status || '').toLowerCase();
  if (status === 'landed' || status === 'cancelled') return [];

  const bookedAt = toMs(input.bookedAt);
  const schedArr = toMs(input.schedArr);
  const schedDep = toMs(input.schedDep);
  const eta = toMs(input.eta) ?? schedArr;

  /** @type {{ at: number, kind: string }[]} */
  const out = [];
  if (input.includeBookingCheck !== false && Number.isFinite(bookedAt)) {
    out.push({ at: bookedAt, kind: 'booking' });
  }

  let check2 = null;
  if (Number.isFinite(schedArr)) {
    check2 = schedArr - 6 * HOUR;
    out.push({ at: check2, kind: 'arr_minus_6h' });
  }

  if (Number.isFinite(schedDep)) {
    const depPlus = schedDep + 30 * MIN;
    // Skip if within 1 h of check 2.
    if (check2 == null || Math.abs(depPlus - check2) >= HOUR) {
      out.push({ at: depPlus, kind: 'dep_plus_30m' });
    }
  }

  if (Number.isFinite(eta)) {
    out.push({ at: eta - 60 * MIN, kind: 'eta_minus_60m' });
    if (status !== 'landed') {
      out.push({ at: eta + 10 * MIN, kind: 'eta_plus_10m' });
    }
  }

  out.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind));
  // Dedupe identical timestamps (keep first kind).
  const seen = new Set();
  const unique = [];
  for (const c of out) {
    if (seen.has(c.at)) continue;
    seen.add(c.at);
    unique.push({ at: new Date(c.at), kind: c.kind });
  }
  return unique;
}

/**
 * Next poll time after `after` (exclusive), recomputed from the latest estimates.
 * Applies a 30-minute floor after `lastCheckedAt` unless `force` (Check now).
 * Returns null when tracking stops (landed / cancelled / no future checks).
 *
 * @param {{
 *   bookedAt?: Date|string|null,
 *   schedArr?: Date|string|null,
 *   schedDep?: Date|string|null,
 *   eta?: Date|string|null,
 *   status?: string|null,
 *   after?: Date|string|null,
 *   lastCheckedAt?: Date|string|null,
 *   force?: boolean,
 *   includeBookingCheck?: boolean,
 * }} input
 * @returns {Date|null}
 */
export function computeNextFlightCheckAt(input) {
  const status = (input.status || '').toLowerCase();
  if (status === 'landed' || status === 'cancelled') return null;

  const plan = planFlightChecks({
    bookedAt: input.bookedAt,
    schedArr: input.schedArr,
    schedDep: input.schedDep,
    eta: input.eta,
    status: input.status,
    includeBookingCheck: input.includeBookingCheck,
  });
  if (!plan.length) return null;

  const after = toMs(input.after) ?? Date.now();
  const lastChecked = toMs(input.lastCheckedAt);
  const minGap = input.force ? 0 : 30 * MIN;

  for (const c of plan) {
    let t = c.at.getTime();
    if (t <= after) continue;
    if (Number.isFinite(lastChecked) && minGap > 0 && t < lastChecked + minGap) {
      t = lastChecked + minGap;
    }
    return new Date(t);
  }
  return null;
}

/**
 * Should the cron poll this booking now?
 * Prefer next_flight_check_at when set; otherwise fall back to the event plan.
 *
 * @param {{
 *   flightStatus?: string|null,
 *   nextFlightCheckAt?: Date|string|null,
 *   schedArr?: Date|string|null,
 *   schedDep?: Date|string|null,
 *   eta?: Date|string|null,
 *   arrivalAt?: Date|string|null,
 *   lastCheckedAt?: Date|string|null,
 *   bookedAt?: Date|string|null,
 *   now?: Date,
 *   force?: boolean,
 * }} input
 */
export function shouldPollFlight(input) {
  const status = (input.flightStatus || '').toLowerCase();
  if (status === 'landed') return { poll: false, reason: 'landed' };
  if (status === 'cancelled') return { poll: false, reason: 'cancelled' };

  const now = (input.now || new Date()).getTime();
  const last = toMs(input.lastCheckedAt);

  if (!input.force && Number.isFinite(last) && now - last < 30 * MIN - 5_000) {
    return { poll: false, reason: 'cooldown', intervalMin: 30 };
  }

  if (input.force) return { poll: true, reason: 'force' };

  const due = toMs(input.nextFlightCheckAt);
  if (due != null) {
    if (due <= now + 5_000) return { poll: true, reason: 'due' };
    return { poll: false, reason: 'not_due', nextAt: new Date(due).toISOString() };
  }

  // Legacy / missing next_flight_check_at: derive from event plan.
  const arrival = input.eta || input.arrivalAt || input.schedArr;
  if (!arrival && !input.schedArr) return { poll: false, reason: 'no_arrival' };

  const next = computeNextFlightCheckAt({
    bookedAt: input.bookedAt,
    schedArr: input.schedArr,
    schedDep: input.schedDep,
    eta: input.eta || input.arrivalAt,
    status: input.flightStatus,
    after: last != null ? last : now - 1,
    lastCheckedAt: input.lastCheckedAt,
    includeBookingCheck: false,
  });
  if (!next) return { poll: false, reason: 'done' };
  if (next.getTime() <= now + 5_000) return { poll: true, reason: 'due' };
  return { poll: false, reason: 'not_due', nextAt: next.toISOString() };
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
