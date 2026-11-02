import { dayBar, type BarView } from './calendar-items';
import { barPosition, packLanes, type DayGrid } from './calendar-position';

export type DriverCalBooking = {
  reference: string;
  driverId: string | null;
  startMs: number;
  endMs: number;
  rangeStartMs: number;
  rangeEndMs: number;
  status: string;
  bookingType: string | null;
  vip: boolean;
  source: string | null;
  vehicleAutoAssigned?: boolean;
};

export type DriverCalShift = {
  driverId: string;
  startMs: number;
  /** Null = still open; clipped to the day end when drawing. */
  endMs: number | null;
};

export type DriverTrack = {
  key: string;
  label: string;
  sub?: string;
  lane?: boolean;
  bars: BarView[];
  buffers: { left: number; width: number }[];
  /** Thin shift underline under the booking bars. */
  shifts: { left: number; width: number }[];
};

function asCalItem(b: DriverCalBooking) {
  return {
    kind: 'booking' as const,
    reference: b.reference,
    classId: '',
    vehicleId: b.driverId ? 'x' : null,
    startMs: b.startMs,
    endMs: b.endMs,
    rangeStartMs: b.rangeStartMs,
    rangeEndMs: b.rangeEndMs,
    status: b.status,
    bookingType: b.bookingType,
    label: null,
    vip: b.vip,
    source: b.source,
    reason: null,
    vehicleAutoAssigned: Boolean(b.vehicleAutoAssigned),
  };
}

/** Day tracks: one row per active driver, then "Needs a driver" lanes. */
export function buildDriverDayTracks(
  grid: DayGrid,
  drivers: { id: string; fullName: string }[],
  bookings: DriverCalBooking[],
  shifts: DriverCalShift[],
): DriverTrack[] {
  const tracks: DriverTrack[] = drivers.map((d) => {
    const mine = bookings.filter((b) => b.driverId === d.id);
    const bars: BarView[] = [];
    const buffers: { left: number; width: number }[] = [];
    for (const b of mine) {
      const drawn = dayBar(grid, asCalItem(b));
      if (drawn) {
        bars.push(drawn.bar);
        buffers.push(...drawn.buffers);
      }
    }
    const shiftSpans: DriverTrack['shifts'] = [];
    for (const s of shifts.filter((x) => x.driverId === d.id)) {
      const end = s.endMs ?? grid.end.getTime();
      const pos = barPosition(grid, new Date(s.startMs), new Date(end));
      if (pos && pos.width > 0) shiftSpans.push(pos);
    }
    return {
      key: d.id,
      label: d.fullName,
      bars,
      buffers,
      shifts: shiftSpans,
    };
  });

  const loose = bookings.filter((b) => !b.driverId);
  const lanes = packLanes(loose);
  lanes.forEach((lane, n) => {
    const t: DriverTrack = {
      key: `needs-driver-${n}`,
      label: n === 0 ? 'Needs a driver' : '',
      sub: n === 0 ? `${loose.length} booking${loose.length === 1 ? '' : 's'}` : undefined,
      lane: true,
      bars: [],
      buffers: [],
      shifts: [],
    };
    for (const b of lane) {
      const drawn = dayBar(grid, asCalItem({ ...b, driverId: null }));
      if (drawn) {
        // Force unassigned styling (no vehicleId).
        drawn.bar.cls = drawn.bar.cls.replace(/\bunassigned\b/, '').trim() + ' unassigned';
        t.bars.push(drawn.bar);
        t.buffers.push(...drawn.buffers);
      }
    }
    tracks.push(t);
  });

  return tracks;
}
