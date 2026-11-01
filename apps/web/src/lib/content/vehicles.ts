import {
  loadSanityVehicleClasses,
  warnMissingSanityClass,
  type SanityVehicleClass,
} from '../server/booking-service';
import { getCatalog, type CatalogClass } from '../server/catalog';

export type PublishableClass = CatalogClass & SanityVehicleClass;

/** Active Postgres classes that have a Sanity vehicleClass document, in sortOrder. */
export async function getPublishableClasses(): Promise<PublishableClass[]> {
  const cat = await getCatalog();
  const sanity = await loadSanityVehicleClasses();
  const byKey = new Map(sanity.map((c) => [c.key, c]));
  const out: PublishableClass[] = [];
  for (const cls of cat.classes) {
    const content = byKey.get(cls.key);
    if (!content) {
      warnMissingSanityClass(cls.key);
      continue;
    }
    out.push({ ...cls, ...content });
  }
  return out;
}
