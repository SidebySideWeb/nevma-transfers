// Imports the website side of the fleet feed (data/fleet-feed.json) into Sanity: one vehicleClass document per
// class (name, full name, type, group, amenities, description, specs, SEO) with its photos from data/fleet-images.
// Run from apps/studio, signed in to Sanity with Editor rights:
//   pnpm exec sanity exec scripts/import-fleet-feed.mjs --with-user-token -- --file ../../data/fleet-feed.json --images ../../data/fleet-images           (dry run)
//   pnpm exec sanity exec scripts/import-fleet-feed.mjs --with-user-token -- --file ../../data/fleet-feed.json --images ../../data/fleet-images --apply   (writes)
// Only the fields above are set; anything else an editor added stays. Photos are uploaded once (Sanity de-duplicates by content).
import { createReadStream, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getCliClient } from 'sanity/cli';
import { loadFeed, validateFeed, toSanityDocs, buildVehicleClassPatch } from '../../../packages/db/scripts/fleet-feed-lib.mjs';

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const file = resolve(opt('--file') ?? '../../data/fleet-feed.json');
const imagesDir = resolve(opt('--images') ?? '../../data/fleet-images');
const apply = args.includes('--apply');

const feed = loadFeed(file);
const { errors } = validateFeed(feed);
if (errors.length) {
  console.error(`The feed has ${errors.length} problem(s):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
const entries = toSanityDocs(feed);
const missing = entries.flatMap((e) => e.images.map((i) => i.file)).filter((f) => !existsSync(join(imagesDir, f)));
if (missing.length) {
  console.error(`Missing image files in ${imagesDir}:\n- ${missing.join('\n- ')}`);
  process.exit(1);
}

const client = getCliClient({ apiVersion: '2025-02-19' });
const existing = await client.fetch(`*[_type == "vehicleClass"]{_id, key, "draft": defined(*[_id == "drafts." + ^._id][0]._id)}`);
const byKey = new Map(existing.map((d) => [d.key, d]));

console.log(apply ? 'Importing into Sanity:' : 'Dry run (nothing written). The import would:');
for (const e of entries) {
  const doc = byKey.get(e.key);
  console.log(`  ${doc ? 'update' : 'create'} ${e._id} (${e.set.name}, ${e.images.length} photos)${doc?.draft ? ' — note: an unpublished draft exists; publish or discard it in the Studio after the import' : ''}`);
}
const others = existing.filter((d) => !entries.some((e) => e.key === d.key));
if (others.length) console.log(`  leave ${others.length} other class document(s) as they are: ${others.map((d) => d.key).join(', ')} (the website shows only classes that are online in the admin)`);
if (!apply) process.exit(0);

const uploaded = new Map();
for (const e of entries) {
  const ids = [];
  for (const img of e.images) {
    if (!uploaded.has(img.file)) {
      const asset = await client.assets.upload('image', createReadStream(join(imagesDir, img.file)), { filename: img.file });
      uploaded.set(img.file, asset._id);
    }
    ids.push(uploaded.get(img.file));
  }
  const patch = buildVehicleClassPatch(e, ids);
  await client
    .transaction()
    .createIfNotExists({ _id: e._id, _type: 'vehicleClass', key: e.key, name: e.set.name })
    .patch(e._id, (p) => p.set(patch))
    .commit();
  console.log(`  done ${e._id}`);
}
console.log(`Uploaded or reused ${uploaded.size} photos.`);
