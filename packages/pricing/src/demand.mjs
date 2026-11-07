/**
 * Pure demand-factor helpers (no I/O). B8 / BOOKING-V2-PLAN §3.
 */

/**
 * Peak concurrent busy count over a window (sweep line, not average).
 * Intervals may extend past the window; only the overlap counts.
 * At a shared boundary, ends (−1) are applied before starts (+1).
 *
 * @param {Array<{ start: Date|string|number, end: Date|string|number }>} intervals
 * @param {Date|string|number} windowStart
 * @param {Date|string|number} windowEnd
 * @returns {number}
 */
export function peakBusyCount(intervals, windowStart, windowEnd) {
  const w0 = new Date(windowStart).getTime();
  const w1 = new Date(windowEnd).getTime();
  if (!Number.isFinite(w0) || !Number.isFinite(w1) || w1 <= w0) return 0;

  /** @type {Array<[number, number]>} */
  const events = [];
  for (const iv of intervals) {
    const s = Math.max(new Date(iv.start).getTime(), w0);
    const e = Math.min(new Date(iv.end).getTime(), w1);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    events.push([s, 1], [e, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  let cur = 0;
  let peak = 0;
  for (const [, delta] of events) {
    cur += delta;
    if (cur > peak) peak = cur;
  }
  return peak;
}

/**
 * Occupancy = peak busy ÷ active vehicles.
 * @returns {{ occupancy: number, unavailable: boolean }}
 */
export function occupancyRatio(peakBusy, activeVehicles) {
  const active = Math.trunc(activeVehicles);
  if (active <= 0) return { occupancy: 0, unavailable: true };
  return { occupancy: Math.max(0, peakBusy) / active, unavailable: false };
}

/**
 * Highest step factor where occupancy > over, capped at max.
 * Returns 1 when feature/settings off or disabled.
 *
 * @param {{
 *   featureOn?: boolean,
 *   demand?: { enabled?: boolean, steps?: Array<{ over: number, factor: number }>, max?: number } | null,
 *   occupancy?: number,
 *   activeVehicles?: number,
 * }} input
 * @returns {{ factor: number, unavailable?: boolean }}
 */
export function demandFactor(input) {
  const featureOn = input.featureOn !== false;
  const demand = input.demand;
  if (!featureOn || !demand || demand.enabled !== true) {
    return { factor: 1 };
  }
  const active = input.activeVehicles;
  if (active != null && Math.trunc(active) <= 0) {
    return { factor: 1, unavailable: true };
  }
  const occupancy = Number(input.occupancy) || 0;
  const steps = Array.isArray(demand.steps) ? demand.steps : [];
  let factor = 1;
  for (const step of steps) {
    const over = Number(step.over);
    const f = Number(step.factor);
    if (!Number.isFinite(over) || !Number.isFinite(f) || f < 1) continue;
    if (occupancy > over && f > factor) factor = f;
  }
  const max = Number(demand.max);
  if (Number.isFinite(max) && max >= 1 && factor > max) factor = max;
  return { factor };
}

/** Resolve per-class demand multiplier from a number or map. */
export function demandForClass(demand, classKey) {
  if (demand != null && typeof demand === 'object' && !Array.isArray(demand)) {
    const v = Number(/** @type {Record<string, number>} */ (demand)[classKey]);
    return Number.isFinite(v) && v > 0 ? v : 1;
  }
  const n = Number(demand);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Apply demand to fixed hybrid/zone routes only when settings say so (default false). */
export function applyDemandToFixedRoute(demandSettings) {
  return demandSettings?.apply_to_fixed_routes === true;
}
