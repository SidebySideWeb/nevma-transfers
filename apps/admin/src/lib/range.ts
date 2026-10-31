function parseInstant(raw: string): Date {
  // Postgres often emits `+00` / `-03`; JS Date needs `+00:00`.
  const normalized = raw.replace(/([+-]\d{2})$/, '$1:00');
  return new Date(normalized);
}

/** Parse a PostgREST/Postgres tstzrange string like `["2026-01-01T10:00:00+00","2026-01-01T11:00:00+00")`. */
export function parseTstzRange(range: unknown): { start: Date; end: Date } | null {
  if (range == null) return null;
  if (typeof range === 'object' && range !== null && 'lower' in range && 'upper' in range) {
    const lower = (range as { lower?: string }).lower;
    const upper = (range as { upper?: string }).upper;
    if (lower && upper) {
      const start = parseInstant(lower);
      const end = parseInstant(upper);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
      return { start, end };
    }
  }
  const raw = String(range);
  const m = raw.match(/^[[(]"?([^",]+)"?,\s*"?([^",\])]+)"?[\])]/);
  if (!m) return null;
  const start = parseInstant(m[1]!);
  const end = parseInstant(m[2]!);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

/** True if two half-open ranges overlap. */
export function rangesOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}
