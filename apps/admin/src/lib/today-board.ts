import { formatExactAthens, formatRelativeTime } from './relative-time';
import { tripStatusClass, tripStatusWord } from './trip-status';

export type FleetNowRow = {
  vehicle_id: string;
  vehicle_label: string;
  class_name: string;
  vehicle_status: string;
  shift_id: string | null;
  shift_started_at: string | null;
  driver_id: string | null;
  driver_name: string | null;
  current_reference: string | null;
  current_trip_status: string | null;
  next_reference: string | null;
  next_pickup_at: string | null;
  last_update_at: string | null;
};

export type DriversNowRow = {
  driver_id: string;
  full_name: string;
  shift_id: string | null;
  shift_started_at: string | null;
  vehicle_label: string | null;
  current_reference: string | null;
  current_trip_status: string | null;
  next_reference: string | null;
  next_pickup_at: string | null;
  jobs_today: number;
  licence_expires_on: string | null;
  permit_expires_on: string | null;
};

export type NeedsBooking = {
  reference: string;
  pickup_at: string;
  missing: 'driver' | 'vehicle' | 'both';
};

export type TodayStats = {
  onShift: number;
  activeDrivers: number;
  vehiclesOut: number;
  vehiclesTotal: number;
  jobsClosed: number;
  jobsTotal: number;
  needsCount: number;
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function athensHm(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Athens',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

function expiresSoonBadge(licence: string | null, permit: string | null, nowMs = Date.now()): string {
  const limit = new Date(nowMs + 30 * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
  const bits: string[] = [];
  if (licence && licence <= limit) {
    bits.push(
      `Licence ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', day: 'numeric', month: 'short' }).format(new Date(`${licence}T12:00:00+02:00`))}`,
    );
  }
  if (permit && permit <= limit) {
    bits.push(
      `Permit ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', day: 'numeric', month: 'short' }).format(new Date(`${permit}T12:00:00+02:00`))}`,
    );
  }
  return bits.map((b) => `<span class="badge s-pending">${esc(b)}</span>`).join(' ');
}

export function computeTodayStats(input: {
  driversNow: DriversNowRow[];
  fleetNow: FleetNowRow[];
  jobsClosed: number;
  jobsTotal: number;
  needs: NeedsBooking[];
}): TodayStats {
  return {
    onShift: input.driversNow.filter((d) => d.shift_id).length,
    activeDrivers: input.driversNow.length,
    vehiclesOut: input.fleetNow.filter((v) => v.shift_id).length,
    vehiclesTotal: input.fleetNow.length,
    jobsClosed: input.jobsClosed,
    jobsTotal: input.jobsTotal,
    needsCount: input.needs.length,
  };
}

export function needsActionSentence(needs: NeedsBooking[]): string {
  if (!needs.length) return '';
  return needs
    .map((n) => {
      const t = athensHm(n.pickup_at);
      if (n.missing === 'both') return `<strong>${esc(n.reference)}</strong> at ${t} has no driver or vehicle`;
      if (n.missing === 'driver') return `<strong>${esc(n.reference)}</strong> at ${t} has no driver`;
      return `<strong>${esc(n.reference)}</strong> at ${t} has no vehicle`;
    })
    .join('. ') + '.';
}

function nowCell(reference: string | null, trip: string | null, freeLabel = 'Free'): string {
  if (reference && trip) {
    return `<a class="ref" href="/bookings/${esc(reference)}">${esc(reference)}</a> <span class="badge ${tripStatusClass(trip)}">${esc(tripStatusWord(trip))}</span>`;
  }
  if (reference) {
    return `<a class="ref" href="/bookings/${esc(reference)}">${esc(reference)}</a>`;
  }
  return `<span class="muted">${esc(freeLabel)}</span>`;
}

function athensDayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Athens',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function isAthensToday(iso: string | null | undefined, now = new Date()): boolean {
  if (!iso) return false;
  return athensDayKey(new Date(iso)) === athensDayKey(now);
}

function nextCell(
  reference: string | null,
  pickup: string | null,
  extra = '',
  nowMs = Date.now(),
): string {
  if (!reference || !isAthensToday(pickup, new Date(nowMs))) return '—';
  return `Next ${athensHm(pickup)} · <a class="ref" href="/bookings/${esc(reference)}">${esc(reference)}</a>${extra}`;
}

function statusChangedCell(iso: string | null, nowMs = Date.now()): string {
  if (!iso) return '—';
  const rel = formatRelativeTime(iso, nowMs);
  const exact = formatExactAthens(iso);
  return `<span title="${esc(exact)}">${esc(rel)}</span>`;
}

/** Table body HTML for Vehicles now (partial refresh). */
export function renderFleetNowTbody(rows: FleetNowRow[], nowMs = Date.now()): string {
  if (!rows.length) {
    return `<tr><td colspan="5" class="muted">No vehicles.</td></tr>`;
  }
  return rows
    .map((r) => {
      const driver = r.shift_id
        ? r.driver_id
          ? `<a href="/drivers/${esc(r.driver_id)}"><span class="dot-on">${esc(r.driver_name ?? 'On shift')}</span></a>`
          : `<span class="dot-on">${esc(r.driver_name ?? 'On shift')}</span>`
        : r.vehicle_status === 'maintenance'
          ? `<span class="badge s-completed">In service</span>`
          : `<span class="dot-off">Not on shift</span>`;
      const now =
        r.shift_id || r.current_reference
          ? nowCell(r.current_reference, r.current_trip_status)
          : '—';
      const nextExtra = !r.driver_id && r.next_reference ? ' <span class="badge s-pending">no driver</span>' : '';
      return `<tr>
  <td class="card-title" data-label="Vehicle">${esc(r.vehicle_label)}<span class="sub">${esc(r.class_name)}</span></td>
  <td data-label="Driver">${driver}</td>
  <td data-label="Now">${now}</td>
  <td data-label="Next job">${nextCell(r.next_reference, r.next_pickup_at, nextExtra, nowMs)}</td>
  <td data-label="Status changed">${statusChangedCell(r.last_update_at, nowMs)}</td>
</tr>`;
    })
    .join('\n');
}

/** Table body HTML for Drivers now (partial refresh). */
export function renderDriversNowTbody(rows: DriversNowRow[], nowMs = Date.now()): string {
  if (!rows.length) {
    return `<tr><td colspan="5" class="muted">No active drivers.</td></tr>`;
  }
  return rows
    .map((r) => {
      const warn = expiresSoonBadge(r.licence_expires_on, r.permit_expires_on, nowMs);
      const onShift = Boolean(r.shift_id);
      const shift = onShift
        ? `<span class="dot-on">Since ${athensHm(r.shift_started_at)}${r.vehicle_label ? ` · ${esc(r.vehicle_label)}` : ''}</span>`
        : `<span class="dot-off">Off today</span>`;
      const now = onShift
        ? r.current_trip_status
          ? `<span class="badge ${tripStatusClass(r.current_trip_status)}">${esc(tripStatusWord(r.current_trip_status))}</span>`
          : `<span class="muted">Free</span>`
        : '—';
      const next = onShift && isAthensToday(r.next_pickup_at, new Date(nowMs))
        ? `Next ${athensHm(r.next_pickup_at)}`
        : onShift
          ? '—'
          : 'Off today';
      return `<tr class="is-link" data-href="/drivers/${esc(r.driver_id)}" tabindex="0">
  <td class="card-title" data-label="Driver"><a href="/drivers/${esc(r.driver_id)}">${esc(r.full_name)}</a> ${warn}</td>
  <td data-label="Shift">${shift}</td>
  <td data-label="Now">${now}</td>
  <td data-label="Next job">${next}</td>
  <td class="num" data-label="Jobs today">${r.jobs_today}</td>
</tr>`;
    })
    .join('\n');
}

/** Full partial payload: both tbodies + updated label time. */
export function renderTodayPartial(input: {
  fleet: FleetNowRow[];
  drivers: DriversNowRow[];
  updatedLabel: string;
}): string {
  return `<div id="today-partial" data-updated="${esc(input.updatedLabel)}">
<table hidden><tbody id="fleet-now-body">${renderFleetNowTbody(input.fleet)}</tbody></table>
<table hidden><tbody id="drivers-now-body">${renderDriversNowTbody(input.drivers)}</tbody></table>
</div>`;
}
