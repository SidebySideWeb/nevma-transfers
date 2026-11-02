import type { SearchState } from '../../components/booking/types';

export type PrefillOptions = {
  zones: { code: string }[];
  classes: { key: string }[];
};

export type PrefillResult = {
  search: Partial<SearchState>;
  classKey: string | null;
};

function read(
  params: URLSearchParams | Record<string, string | null | undefined>,
  key: string,
): string | null {
  if (params instanceof URLSearchParams) {
    const v = params.get(key);
    return v == null || v === '' ? null : v;
  }
  const v = params[key];
  return v == null || v === '' ? null : v;
}

/**
 * Parse `/book` query params against booking-options.
 * Unknown / malformed values are ignored. Price-like keys are never copied.
 */
export function parseBookingPrefill(
  params: URLSearchParams | Record<string, string | null | undefined>,
  options: PrefillOptions,
): PrefillResult {
  const zoneCodes = new Set(options.zones.map((z) => z.code));
  const classKeys = new Set(options.classes.map((c) => c.key));
  const search: Partial<SearchState> = {};

  const type = read(params, 'type');
  if (type === 'transfer' || type === 'hourly') search.type = type;

  const from = read(params, 'from');
  if (from && zoneCodes.has(from)) search.fromZone = from;

  const to = read(params, 'to');
  if (to && zoneCodes.has(to)) search.toZone = to;

  const hoursRaw = read(params, 'hours');
  if (hoursRaw != null) {
    const hours = Number(hoursRaw);
    if (Number.isFinite(hours) && hours > 0) search.hours = hours;
  }

  const passengersRaw = read(params, 'passengers');
  if (passengersRaw != null) {
    const passengers = Number(passengersRaw);
    if (Number.isFinite(passengers) && passengers > 0) search.passengers = passengers;
  }

  const luggageRaw = read(params, 'luggage');
  if (luggageRaw != null) {
    const luggage = Number(luggageRaw);
    if (Number.isFinite(luggage) && luggage >= 0) search.luggage = luggage;
  }

  const date = read(params, 'date');
  const time = read(params, 'time');
  if (date && time && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}/.test(time)) {
    search.pickupLocal = `${date}T${time.slice(0, 5)}`;
  }

  const classRaw = read(params, 'class');
  const classKey = classRaw && classKeys.has(classRaw) ? classRaw : null;

  return { search, classKey };
}

/** Quote / hold request body from search — never includes client money fields. */
export function quoteRequestBody(
  search: Pick<
    SearchState,
    'type' | 'fromZone' | 'toZone' | 'hours' | 'pickupLocal' | 'passengers' | 'luggage'
  >,
  classKey?: string,
): Record<string, unknown> {
  const base =
    search.type === 'transfer'
      ? {
          type: 'transfer' as const,
          fromZone: search.fromZone,
          toZone: search.toZone,
          pickupLocal: search.pickupLocal,
          passengers: search.passengers,
          luggage: search.luggage,
        }
      : {
          type: 'hourly' as const,
          fromZone: search.fromZone,
          hours: search.hours,
          pickupLocal: search.pickupLocal,
          passengers: search.passengers,
          luggage: search.luggage,
        };
  return classKey ? { ...base, classKey } : { ...base };
}
