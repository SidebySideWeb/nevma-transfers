import { BookingError } from './types';

export function quoteTransfer(input: { zonePriceCents: number | null }): number {
  if (input.zonePriceCents === null) {
    throw new BookingError('no_price', {
      stringKey: 'error.no_price',
      message: 'no zone price',
    });
  }
  return input.zonePriceCents;
}

export function quoteHourly(input: {
  rateCents: number | null;
  minHours: number;
  maxHours: number;
  hours: number;
}): number {
  if (input.rateCents === null) {
    throw new BookingError('no_price', {
      stringKey: 'error.no_price',
      message: 'no hourly rate',
    });
  }

  const { hours, minHours, maxHours } = input;
  if (!Number.isInteger(hours) || hours < minHours || hours > maxHours) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.hours_range',
      vars: { min: minHours, max: maxHours },
      field: 'hours',
      message: 'hours out of range',
    });
  }

  return input.rateCents * hours;
}

export function totalWithExtras(
  baseCents: number,
  chosen: string[],
  extras: { code: string; priceCents: number; active: boolean }[],
): { totalCents: number; lines: { code: string; cents: number }[] } {
  const byCode = new Map(extras.map((e) => [e.code, e]));
  const seen = new Set<string>();
  const lines: { code: string; cents: number }[] = [];

  for (const code of chosen) {
    if (seen.has(code)) continue;
    seen.add(code);
    const extra = byCode.get(code);
    if (!extra || !extra.active) {
      throw new BookingError('invalid_request', {
        field: 'extras',
        stringKey: 'error.invalid_request',
        message: `unknown or inactive extra: ${code}`,
      });
    }
    lines.push({ code, cents: extra.priceCents });
  }

  const totalCents = baseCents + lines.reduce((sum, line) => sum + line.cents, 0);
  return { totalCents, lines };
}

export function formatEuro(cents: number): string {
  const euros = (cents / 100).toFixed(2);
  return `€ ${euros}`;
}

/** Format `vat_rate_bp` for display (2400 → "24", 1250 → "12.5"). */
export function formatVatRate(bp: number): string {
  return String(Number((bp / 100).toFixed(2)));
}
