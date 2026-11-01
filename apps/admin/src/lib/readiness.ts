/** Class readiness facts for the "Ready for customers?" checklist and banner. */

export type ReadinessFacts = {
  key: string;
  hasActiveVehicle: boolean;
  hasPriceOrRate: boolean;
  hasSanityPhotos: boolean;
  online: boolean;
};

export type ReadinessItem = {
  id: 'vehicle' | 'price' | 'sanity' | 'online';
  label: string;
  done: boolean;
};

const LABELS: Record<ReadinessItem['id'], string> = {
  vehicle: 'At least one active vehicle',
  price: 'Zone prices or an hourly rate',
  sanity: 'Sanity page with photos',
  online: 'Online',
};

export function readinessChecklist(facts: Omit<ReadinessFacts, 'key'>): ReadinessItem[] {
  return [
    { id: 'vehicle', label: LABELS.vehicle, done: facts.hasActiveVehicle },
    { id: 'price', label: LABELS.price, done: facts.hasPriceOrRate },
    { id: 'sanity', label: LABELS.sanity, done: facts.hasSanityPhotos },
    { id: 'online', label: LABELS.online, done: facts.online },
  ];
}

/** Missing checklist labels (excluding "Online" itself) for banner copy. */
export function readinessMissingLabels(facts: Omit<ReadinessFacts, 'key'>): string[] {
  return readinessChecklist(facts)
    .filter((i) => i.id !== 'online' && !i.done)
    .map((i) => i.label.toLowerCase());
}

/** Banner line when a class is online but misses readiness items. */
export function readinessBannerLine(facts: ReadinessFacts): string | null {
  if (!facts.online) return null;
  const missing = readinessMissingLabels(facts);
  if (missing.length === 0) return null;
  return `Class ${facts.key} is online but not ready: ${missing.join(', ')}`;
}
