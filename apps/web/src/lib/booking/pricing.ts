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

export type ExtraChoice = { code: string; quantity: number };

/** Normalise booking extras: strings → qty 1; merge duplicate codes. */
export function normaliseExtraChoices(
  chosen: Array<string | { code: string; quantity?: number }>,
): ExtraChoice[] {
  const qty = new Map<string, number>();
  for (const item of chosen) {
    if (typeof item === 'string') {
      // Plain codes are unique selections at quantity 1 (duplicates ignored).
      if (!qty.has(item)) qty.set(item, 1);
      continue;
    }
    const n = item.quantity ?? 1;
    qty.set(item.code, Math.max(qty.get(item.code) ?? 0, n));
  }
  return [...qty.entries()].map(([code, quantity]) => ({ code, quantity }));
}

/** Expand choices to the repeated-code array expected by create_booking_from_hold. */
export function expandExtraCodes(choices: ExtraChoice[]): string[] {
  const out: string[] = [];
  for (const c of choices) {
    for (let i = 0; i < c.quantity; i++) out.push(c.code);
  }
  return out;
}

export function totalWithExtras(
  baseCents: number,
  chosen: Array<string | { code: string; quantity?: number }>,
  extras: {
    code: string;
    priceCents: number;
    active: boolean;
    maxQuantity?: number;
    appliesTo?: string[];
  }[],
  bookingType?: 'transfer' | 'hourly',
): { totalCents: number; lines: { code: string; cents: number; quantity: number }[] } {
  const byCode = new Map(extras.map((e) => [e.code, e]));
  const choices = normaliseExtraChoices(chosen);
  const lines: { code: string; cents: number; quantity: number }[] = [];

  for (const { code, quantity } of choices) {
    const extra = byCode.get(code);
    if (!extra || !extra.active) {
      throw new BookingError('invalid_request', {
        field: 'extras',
        stringKey: 'error.invalid_request',
        message: `unknown or inactive extra: ${code}`,
      });
    }
    if (bookingType && extra.appliesTo && !extra.appliesTo.includes(bookingType)) {
      throw new BookingError('invalid_request', {
        field: 'extras',
        stringKey: 'error.invalid_request',
        message: `extra ${code} not offered for ${bookingType}`,
      });
    }
    const max = extra.maxQuantity ?? 1;
    if (quantity < 1 || quantity > max) {
      throw new BookingError('invalid_request', {
        field: 'extras',
        stringKey: 'error.invalid_request',
        message: `quantity ${quantity} for ${code} exceeds max ${max}`,
      });
    }
    lines.push({ code, quantity, cents: extra.priceCents * quantity });
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
