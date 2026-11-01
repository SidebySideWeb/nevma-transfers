import { athensTime } from './athens-day';
import { barPosition, HOUR_PX, type DayGrid } from './calendar-position';
import { parseTstzRange } from './range';

/** One row of the `calendar_items` view, with its times parsed. */
export type CalItem = {
  kind: 'booking' | 'hold' | 'block';
  reference: string | null;
  classId: string;
  vehicleId: string | null;
  /** Pick-up to drop-off (what the bar shows). */
  startMs: number;
  endMs: number;
  /** Whole blocked range including buffers. */
  rangeStartMs: number;
  rangeEndMs: number;
  status: string;
  bookingType: string | null;
  label: string | null;
  vip: boolean;
  source: string | null;
  reason: string | null;
};

type Row = {
  kind: string | null;
  reference: string | null;
  class_id: string | null;
  vehicle_id: string | null;
  range: unknown;
  pickup_at: string | null;
  ends_at: string | null;
  status: string | null;
  booking_type: string | null;
  label: string | null;
  vip_security: boolean | null;
  source: string | null;
  reason: string | null;
};

export function parseItems(rows: Row[]): CalItem[] {
  const out: CalItem[] = [];
  for (const r of rows) {
    const range = parseTstzRange(r.range);
    if (!range || !r.class_id || !r.pickup_at || !r.ends_at) continue;
    if (r.kind !== 'booking' && r.kind !== 'hold' && r.kind !== 'block') continue;
    out.push({
      kind: r.kind,
      reference: r.reference,
      classId: r.class_id,
      vehicleId: r.vehicle_id,
      startMs: new Date(r.pickup_at).getTime(),
      endMs: new Date(r.ends_at).getTime(),
      rangeStartMs: range.start.getTime(),
      rangeEndMs: range.end.getTime(),
      status: r.status ?? '',
      bookingType: r.booking_type,
      label: r.label,
      vip: Boolean(r.vip_security),
      source: r.source,
      reason: r.reason,
    });
  }
  return out;
}

export type BarView = {
  tag: 'a' | 'span';
  href?: string;
  cls: string;
  left: number;
  width: number;
  /** Accessible name. Starts with the visible text. */
  name: string;
  code: string;
  sub: string;
};

export function describe(it: CalItem): { code: string; sub: string; name: string; cls: string; href?: string } {
  const times = `${athensTime(new Date(it.startMs))}–${athensTime(new Date(it.endMs))}`;
  if (it.kind === 'block') {
    const tail = it.reason ? ` · ${it.reason}` : '';
    return {
      code: 'Blocked',
      sub: `${times}${tail}`,
      name: `Blocked ${times}${tail}`,
      cls: 'bar block',
      href: '/blocked-slots',
    };
  }
  if (it.kind === 'hold') {
    const who = it.source === 'office' ? 'office payment link' : 'online customer choosing';
    return { code: 'Held', sub: `${times} · ${it.source ?? 'online'}`, name: `Held ${times} · ${who}`, cls: 'bar hold' };
  }
  const tags: string[] = [];
  if (it.source === 'office') tags.push('Office');
  if (it.vip) tags.push('VIP security');
  if (it.bookingType === 'hourly') {
    tags.push(`Hourly ${Math.round((it.endMs - it.startMs) / 3_600_000)} h`);
  }
  const visible = [times, ...tags.slice(0, 1)].join(' · ');
  const words: string[] = [];
  if (it.label) words.push(it.label);
  if (!it.vehicleId) words.push('needs a vehicle');
  if (it.status === 'pending') words.push('waiting for payment');
  if (it.status === 'completed') words.push('completed');
  const rest = [...tags.slice(1), ...words].join(', ');
  return {
    code: it.reference ?? '',
    sub: visible,
    name: `${it.reference} ${visible}${rest ? `, ${rest}` : ''}`,
    cls: [
      'bar',
      it.vip ? 'vip' : '',
      !it.vehicleId ? 'unassigned' : '',
      it.status === 'pending' ? 'pending' : '',
      it.status === 'completed' ? 'done' : '',
    ]
      .filter(Boolean)
      .join(' '),
    href: `/bookings/${it.reference}`,
  };
}

/** Day view: bar and buffer rectangles (px) for one item, clipped to the day. */
export function dayBar(
  grid: DayGrid,
  it: CalItem,
  px: number = HOUR_PX,
): { bar: BarView; buffers: { left: number; width: number }[] } | null {
  const pos = barPosition(grid, new Date(it.startMs), new Date(it.endMs), px);
  if (!pos) return null;
  const d = describe(it);
  const buffers = [
    barPosition(grid, new Date(it.rangeStartMs), new Date(it.startMs), px),
    barPosition(grid, new Date(it.endMs), new Date(it.rangeEndMs), px),
  ].filter((b): b is { left: number; width: number } => b !== null && b.width > 0);
  return {
    bar: {
      tag: d.href ? 'a' : 'span',
      href: d.href,
      cls: d.cls,
      left: pos.left,
      width: pos.width,
      name: d.name,
      code: d.code,
      sub: pos.width >= 90 ? d.sub : '',
    },
    buffers,
  };
}
