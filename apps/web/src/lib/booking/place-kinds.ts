/** Public place kinds (0038). `address` is private-only and never listed here. */
export const PUBLIC_PLACE_KINDS = [
  'airport',
  'port',
  'station',
  'landmark',
  'square',
  'hotel',
  'venue',
  'area',
] as const;

export type PublicPlaceKind = (typeof PUBLIC_PLACE_KINDS)[number];

export const PUBLIC_PLACE_KIND_LABELS: Record<PublicPlaceKind, string> = {
  airport: 'Airport',
  port: 'Port',
  station: 'Station',
  landmark: 'Landmark',
  square: 'Square',
  hotel: 'Hotel',
  venue: 'Venue',
  area: 'Area',
};

export function isPublicPlaceKind(k: string): k is PublicPlaceKind {
  return (PUBLIC_PLACE_KINDS as readonly string[]).includes(k);
}
