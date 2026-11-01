import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { vehicleClass } from './vehicleClass';
// @ts-expect-error plain JS module shared with the database importer
import { loadFeed, toSanityDocs, buildVehicleClassPatch } from '../../../packages/db/scripts/fleet-feed-lib.mjs';
import { validateVehicleKey } from './lib/vehicleKey';

const feed = loadFeed(fileURLToPath(new URL('../../../data/fleet-feed.json', import.meta.url)));

describe('fleet feed → Sanity vehicleClass', () => {
  const fields = new Set((vehicleClass.fields as { name: string }[]).map((f) => f.name));
  const docs = toSanityDocs(feed);

  it('every field the importer sets exists in the schema', () => {
    for (const d of docs) {
      const patch = buildVehicleClassPatch(d, d.images.map((_: unknown, i: number) => `image-${i}-1x1-jpg`));
      for (const k of Object.keys(patch)) expect(fields.has(k), k).toBe(true);
    }
  });

  it('keys are valid, photos within the schema limit, group is one of the options', () => {
    const groups = ((vehicleClass.fields as any[]).find((f) => f.name === 'group').options.list as { value: string }[]).map((o) => o.value);
    for (const d of docs) {
      expect(validateVehicleKey(d.key)).toBe(true);
      expect(d.images.length).toBeGreaterThan(0);
      expect(d.images.length).toBeLessThanOrEqual(12);
      expect(groups).toContain(d.set.group);
    }
  });
});
