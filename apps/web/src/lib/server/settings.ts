import 'server-only';
import { bookingDb } from './db';

export type AppSettings = {
  holdMinutes: number;
  officeLinkHoldMinutes: number;
  minLeadMinutes: number;
  cancelWindowHours: number;
  maxActiveHoldsPerVisitor: number;
  timezone: string;
};

const CACHE_MS = 60_000;
let cache: { value: AppSettings; expiresAt: number } | null = null;

function asNumber(value: unknown, key: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`settings.${key} is not a number`);
  }
  return n;
}

function asString(value: unknown, key: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`settings.${key} is not a string`);
  }
  return value;
}

/** Reads `settings` (cached 60 s). */
export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() < cache.expiresAt) {
    return cache.value;
  }

  const { rows } = await bookingDb().query<{ key: string; value: unknown }>(
    `select key, value from public.settings`,
  );
  const map = new Map(rows.map((row) => [row.key, row.value]));

  const value: AppSettings = {
    holdMinutes: asNumber(map.get('hold_minutes'), 'hold_minutes'),
    officeLinkHoldMinutes: asNumber(
      map.get('office_link_hold_minutes') ?? 240,
      'office_link_hold_minutes',
    ),
    minLeadMinutes: asNumber(map.get('min_lead_minutes'), 'min_lead_minutes'),
    cancelWindowHours: asNumber(map.get('cancel_window_hours'), 'cancel_window_hours'),
    maxActiveHoldsPerVisitor: asNumber(
      map.get('max_active_holds_per_visitor'),
      'max_active_holds_per_visitor',
    ),
    timezone: asString(map.get('timezone'), 'timezone'),
  };

  cache = { value, expiresAt: Date.now() + CACHE_MS };
  return value;
}

/** Test helper - clears the 60 s cache. */
export function clearSettingsCache(): void {
  cache = null;
}
