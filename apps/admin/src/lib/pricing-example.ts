/** Live example line for Rates cards: 20 km, 30 min with base / per_km / per_min / minimum. */
export function exampleTripCents(input: {
  baseFare: number;
  perKm: number;
  perMin: number;
  minimumFare: number;
  distanceKm?: number;
  durationMin?: number;
}): number {
  const km = input.distanceKm ?? 20;
  const min = input.durationMin ?? 30;
  const raw = input.baseFare + input.perKm * km + input.perMin * min;
  return Math.max(raw, input.minimumFare);
}

export function formatEuroCents(cents: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

/** Factor 1.2 → "+20 %". */
export function factorToPlusPercent(factor: number): string {
  const pct = Math.round((factor - 1) * 100);
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct} %`;
}

export function plusPercentToFactor(pct: number): number {
  return 1 + pct / 100;
}
