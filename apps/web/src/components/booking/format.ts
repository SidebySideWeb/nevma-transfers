export { formatEuro } from '../../lib/booking/pricing';
export { formatLocal } from '../../lib/booking/time';

/** V2 design price text: "€223.20" (the design has no space after the symbol). Display only. */
export function formatEuroV2(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}
