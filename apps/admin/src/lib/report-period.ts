import { Temporal } from '@js-temporal/polyfill';
import { ATHENS } from './time';

export type PeriodKind = 'week' | 'month' | 'quarter' | 'custom';

/** Athens calendar date today. */
export function athensTodayKey(now = new Date()): string {
  return Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(ATHENS).toPlainDate().toString();
}

/** Yesterday in Athens (statements presets end yesterday). */
export function athensYesterdayKey(now = new Date()): string {
  return Temporal.PlainDate.from(athensTodayKey(now)).subtract({ days: 1 }).toString();
}

/** Monday-start week containing `dateKey`. */
export function weekRangeContaining(dateKey: string): { from: string; to: string } {
  const d = Temporal.PlainDate.from(dateKey);
  const monday = d.subtract({ days: d.dayOfWeek - 1 });
  const sunday = monday.add({ days: 6 });
  return { from: monday.toString(), to: sunday.toString() };
}

export function monthRangeContaining(dateKey: string): { from: string; to: string } {
  const d = Temporal.PlainDate.from(dateKey);
  const from = d.with({ day: 1 });
  const to = from.add({ months: 1 }).subtract({ days: 1 });
  return { from: from.toString(), to: to.toString() };
}

/** Three calendar months ending on the month of `dateKey`. */
export function threeMonthRangeEnding(dateKey: string): { from: string; to: string } {
  const { to } = monthRangeContaining(dateKey);
  const end = Temporal.PlainDate.from(to);
  const from = end.with({ day: 1 }).subtract({ months: 2 });
  return { from: from.toString(), to: end.toString() };
}

export function resolvePeriod(
  kind: PeriodKind,
  customFrom: string | null,
  customTo: string | null,
  now = new Date(),
): { from: string; to: string; kind: PeriodKind } {
  const anchor = athensYesterdayKey(now);
  if (kind === 'week') return { kind, ...weekRangeContaining(anchor) };
  if (kind === 'month') return { kind, ...monthRangeContaining(anchor) };
  if (kind === 'quarter') return { kind, ...threeMonthRangeEnding(anchor) };
  const from = customFrom && /^\d{4}-\d{2}-\d{2}$/.test(customFrom) ? customFrom : anchor;
  const to = customTo && /^\d{4}-\d{2}-\d{2}$/.test(customTo) ? customTo : anchor;
  if (to < from) throw new Error('invalid_period');
  return { kind: 'custom', from, to };
}

/** Statement presets: same starts as reports, but `to` is Athens yesterday. */
export function resolveStatementPeriod(
  kind: PeriodKind,
  customFrom: string | null,
  customTo: string | null,
  now = new Date(),
): { from: string; to: string; kind: PeriodKind } {
  const yesterday = athensYesterdayKey(now);
  if (kind === 'custom') return resolvePeriod('custom', customFrom, customTo, now);
  const full = resolvePeriod(kind, null, null, now);
  const to = full.to < yesterday ? full.to : yesterday;
  const from = full.from > to ? to : full.from;
  return { kind, from, to };
}

export function periodFileStamp(from: string, to: string): string {
  return `${from}_${to}`;
}
