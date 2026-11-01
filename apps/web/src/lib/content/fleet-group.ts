/** Map vehicle class tagline/name to fleet filter group (board 02). */
export type FleetGroup = 'van' | 'saloon';

export function fleetGroup(tagline?: string | null, name?: string | null): FleetGroup {
  const s = `${tagline ?? ''} ${name ?? ''}`.toLowerCase();
  if (/saloon|sedan|e-class|s-class/.test(s) && !/van|sprinter|vito|v-class/.test(s)) {
    return 'saloon';
  }
  if (/saloon|executive saloon/.test(s)) return 'saloon';
  return 'van';
}
