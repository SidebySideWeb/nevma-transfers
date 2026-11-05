import { Temporal } from '@js-temporal/polyfill';
import { ATHENS } from './time';

/** Width of one hour in the day view (matches `--hour` in admin.css). */
export const HOUR_PX = 72;
/** Width of one day in the week view (matches `--day` in admin.css). */
export const DAY_PX = 150;

/** One Athens calendar day as a grid of real elapsed hours (23, 24 or 25 on DST changes). */
export interface DayGrid {
  dateKey: string;
  start: Date;
  end: Date;
  /** Elapsed minutes in the day: 1380, 1440 or 1500. */
  minutes: number;
  hours: number;
  hourStarts: Date[];
}

export function dayGrid(dateKey: string): DayGrid {
  const day = Temporal.PlainDate.from(dateKey);
  const start = day.toZonedDateTime(ATHENS);
  const end = day.add({ days: 1 }).toZonedDateTime(ATHENS);
  const startMs = Number(start.epochMilliseconds);
  const endMs = Number(end.epochMilliseconds);
  const minutes = (endMs - startMs) / 60_000;
  const hours = minutes / 60;
  return {
    dateKey,
    start: new Date(startMs),
    end: new Date(endMs),
    minutes,
    hours,
    hourStarts: Array.from({ length: hours }, (_, i) => new Date(startMs + i * 3_600_000)),
  };
}

/** Elapsed minutes since Athens midnight, clamped to the day. */
export function minutesSinceMidnight(grid: DayGrid, instant: Date): number {
  const m = (instant.getTime() - grid.start.getTime()) / 60_000;
  return Math.min(grid.minutes, Math.max(0, m));
}

/**
 * Left offset and width (px) of [start, end) inside the day, clipped to the day.
 * `pxPerHour` is `HOUR_PX` in the day view, `DAY_PX / grid.hours` inside a week cell.
 */
export function barPosition(
  grid: DayGrid,
  start: Date,
  end: Date,
  pxPerHour: number = HOUR_PX,
): { left: number; width: number } | null {
  if (end.getTime() <= grid.start.getTime() || start.getTime() >= grid.end.getTime()) return null;
  const a = minutesSinceMidnight(grid, start);
  const b = minutesSinceMidnight(grid, end);
  return { left: (a / 60) * pxPerHour, width: ((b - a) / 60) * pxPerHour };
}

/** "06:00" style label for hour `i` of the day; the repeated autumn hour gets a superscript 2. */
export function hourLabel(grid: DayGrid, i: number): string {
  const label = (d: Date) => {
    const z = Temporal.Instant.fromEpochMilliseconds(d.getTime()).toZonedDateTimeISO(ATHENS);
    return `${String(z.hour).padStart(2, '0')}:00`;
  };
  const here = label(grid.hourStarts[i]!);
  return i > 0 && label(grid.hourStarts[i - 1]!) === here ? `${here}²` : here;
}

/** Epoch ms of `HH:mm` Athens wall-clock time on a date (e.g. where to scroll to 06:00). */
export function athensLocalMs(dateKey: string, time: string): number {
  return Number(
    Temporal.PlainDate.from(dateKey).toZonedDateTime({
      timeZone: ATHENS,
      plainTime: Temporal.PlainTime.from(time),
    }).epochMilliseconds,
  );
}

/** Athens date key (`YYYY-MM-DD`) of an instant. */
export function athensDateKey(instant: Date): string {
  const z = Temporal.Instant.fromEpochMilliseconds(instant.getTime()).toZonedDateTimeISO(ATHENS);
  return z.toPlainDate().toString();
}

export function shiftDate(dateKey: string, days: number): string {
  return Temporal.PlainDate.from(dateKey).add({ days }).toString();
}

/** Monday of the week containing `dateKey`, then the seven day keys. */
export function weekDays(dateKey: string): string[] {
  const d = Temporal.PlainDate.from(dateKey);
  const monday = d.subtract({ days: d.dayOfWeek - 1 });
  return Array.from({ length: 7 }, (_, i) => monday.add({ days: i }).toString());
}

/** Greedy lane packing so overlapping bars in a shared lane do not hide each other. */
export function packLanes<T extends { startMs: number; endMs: number }>(items: T[]): T[][] {
  const lanes: T[][] = [];
  for (const it of [...items].sort((a, b) => a.startMs - b.startMs)) {
    const lane = lanes.find((l) => l[l.length - 1]!.endMs <= it.startMs);
    if (lane) lane.push(it);
    else lanes.push([it]);
  }
  return lanes;
}
