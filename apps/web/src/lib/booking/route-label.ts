/** Zone name when set; otherwise a short form of the address (distance bookings have no zones). */
export function placeLabel(
  zoneName: string | null | undefined,
  address: string | null | undefined,
): string {
  const zone = (zoneName ?? '').trim();
  if (zone) return zone;
  const addr = (address ?? '').trim();
  if (!addr) return '—';
  const head = addr.split(',')[0]?.trim();
  return head || addr;
}

/** "From → To" for transfer; prefers zone names, falls back to addresses. */
export function transferRouteLabel(
  fromZone: string | null | undefined,
  toZone: string | null | undefined,
  pickupAddress: string | null | undefined,
  dropoffAddress: string | null | undefined,
): string {
  return `${placeLabel(fromZone, pickupAddress)} → ${placeLabel(toZone, dropoffAddress)}`;
}
