import { formatEuro } from '../booking/pricing';
import type { Catalog } from '../server/catalog';
import { fromPriceForClass, hourlyFromForClass } from '../server/catalog';

/** Lowest transfer price across all classes (integer cents). */
export function lowestTransferCents(cat: Catalog): number | null {
  let min: number | null = null;
  for (const c of cat.classes) {
    const cents = fromPriceForClass(cat, c.key);
    if (cents == null) continue;
    if (min == null || cents < min) min = cents;
  }
  return min;
}

/** Lowest hourly rate across all classes (integer cents). */
export function lowestHourlyCents(cat: Catalog): number | null {
  let min: number | null = null;
  for (const c of cat.classes) {
    const cents = hourlyFromForClass(cat, c.key);
    if (cents == null) continue;
    if (min == null || cents < min) min = cents;
  }
  return min;
}

/** Fill `{fromTransfer}` / `{fromHourly}` in a booking-option price note. */
export function fillBookingOptionNote(
  template: string,
  prices: { fromTransfer: string; fromHourly: string },
): string {
  return template
    .replaceAll('{fromTransfer}', prices.fromTransfer)
    .replaceAll('{fromHourly}', prices.fromHourly);
}

export function bookingOptionPriceLabels(
  cat: Catalog,
  show: boolean,
): { fromTransfer: string; fromHourly: string } {
  const tCents = lowestTransferCents(cat);
  const hCents = lowestHourlyCents(cat);
  return {
    fromTransfer: show && tCents != null ? formatEuro(tCents) : '—',
    fromHourly: show && hCents != null ? formatEuro(hCents) : '—',
  };
}
