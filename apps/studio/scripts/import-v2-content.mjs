// Puts the V2 design content into an existing Sanity dataset without touching anything else:
// the page documents (home, fleet, services, vip-security, about, contact, request-a-transfer, legal pages,
// the legal hub and the vehicle page template) get the V2 sections from scripts/v2-content.mjs, with the design
// photos uploaded from design/v2/pages/images; uiStrings gets every missing key.
// Run from apps/studio, signed in to Sanity with Editor rights:
//   pnpm exec sanity exec scripts/import-v2-content.mjs --with-user-token                                  (dry run)
//   pnpm exec sanity exec scripts/import-v2-content.mjs --with-user-token -- --apply                       (writes)
//   ... -- --apply --use-design-copy   also sets the uiStrings keys whose wording changed to the V2 design copy
// Page SEO fields and internal notes an editor already filled stay as they are. Vehicle classes, routes, forms,
// site settings and submissions are not changed.
import { createReadStream, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getCliClient } from 'sanity/cli';
import { v2Pages, V2_UPDATED_UI_KEYS } from '../../../scripts/v2-content.mjs';
import { uiStringDefaults } from '../schemaTypes/lib/uiStringDefaults.ts';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const useDesignCopy = args.includes('--use-design-copy');
const imagesDir = resolve('../../design/v2/pages/images');

let n = 0;
const key = () => `v2${(++n).toString(36).padStart(5, '0')}`;
const block = (text, style = 'normal') => ({ _type: 'block', _key: key(), style, markDefs: [], children: [{ _type: 'span', _key: key(), text, marks: [] }] });
const img = (file, alt) => ({ _type: 'image', __file: file, alt });
const ref = (id) => ({ _type: 'reference', _ref: id });
const pages = v2Pages({ key, img, ref, block });

const client = getCliClient({ apiVersion: '2025-02-19' });
const files = new Set();
const walk = (v, fn) => { if (Array.isArray(v)) v.forEach((x) => walk(x, fn)); else if (v && typeof v === 'object') { fn(v); Object.values(v).forEach((x) => walk(x, fn)); } };
pages.forEach((p) => walk(p.sections, (o) => o.__file && files.add(o.__file)));
const missingFiles = [...files].filter((f) => !existsSync(join(imagesDir, f)));
if (missingFiles.length) { console.error(`Missing photos in ${imagesDir}: ${missingFiles.join(', ')}`); process.exit(1); }

// References: the three forms and a featured route must exist.
const refs = new Set(); pages.forEach((p) => walk(p.sections, (o) => o._type === 'reference' && refs.add(o._ref)));
const found = new Set(await client.fetch('*[_id in $ids]._id', { ids: [...refs] }));
const routeFallback = await client.fetch('*[_type == "route" && !(_id in path("drafts.**"))] | order(featured desc, sortOrder asc)[0]._id');
const problems = [];
for (const id of refs) {
  if (found.has(id)) continue;
  if (id.startsWith('route-') && routeFallback) { pages.forEach((p) => walk(p.sections, (o) => { if (o._ref === id) o._ref = routeFallback; })); console.log(`  featured route ${id} not found: using ${routeFallback}`); }
  else problems.push(`missing ${id} (run the kit 2 seed or create it in the Studio first)`);
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

const existing = await client.fetch('*[_type == "page" && !(_id in path("drafts.**"))]{_id, "slug": slug.current, seo, internalNote}');
const bySlug = new Map(existing.map((d) => [d.slug, d]));
const ui = await client.fetch('*[_id == "uiStrings"][0]{strings}');
const have = new Map((ui?.strings ?? []).map((s) => [s.key, s]));
const addKeys = uiStringDefaults.filter((d) => !have.has(d.key));
const changeKeys = useDesignCopy ? uiStringDefaults.filter((d) => V2_UPDATED_UI_KEYS.includes(d.key) && have.has(d.key) && have.get(d.key).value !== d.value) : [];

console.log(apply ? 'Writing V2 content to Sanity:' : 'Dry run (nothing written). The import would:');
for (const p of pages) console.log(`  ${bySlug.has(p.slug) ? 'replace the sections of' : 'create'} page "${p.slug}" (${p.sections.length} sections: ${p.sections.map((s) => s._type).join(', ')})`);
console.log(`  upload ${files.size} design photos (Sanity reuses identical files)`);
console.log(`  add ${addKeys.length} uiStrings keys${useDesignCopy ? `, set ${changeKeys.length} keys to the V2 wording` : ''}`);
if (!useDesignCopy) console.log('  (add --use-design-copy to also switch the reworded keys, such as booking.pickup.zone, to the V2 wording)');
if (!apply) process.exit(0);

const assetIds = new Map();
for (const f of files) assetIds.set(f, (await client.assets.upload('image', createReadStream(join(imagesDir, f)), { filename: f }))._id);
pages.forEach((p) => walk(p.sections, (o) => { if (o.__file) { o.asset = { _type: 'reference', _ref: assetIds.get(o.__file) }; delete o.__file; } }));

const tx = client.transaction();
for (const p of pages) {
  const id = bySlug.get(p.slug)?._id ?? `page-${p.slug}`;
  const old = bySlug.get(p.slug);
  tx.createIfNotExists({ _id: id, _type: 'page', kind: p.kind, title: p.title, slug: { _type: 'slug', current: p.slug } });
  tx.patch(id, (q) => q.set({
    kind: p.kind, title: p.title,
    sections: p.sections.map((s) => ({ _key: key(), ...s })),
    ...(old?.seo?.title ? {} : { seo: { _type: 'seo', title: p.seoTitle, description: p.seoDescription } }),
    ...(old?.internalNote ? {} : { internalNote: 'V2 design content: review the text, replace [bracketed] placeholders before launch.' }),
  }));
}
tx.createIfNotExists({ _id: 'uiStrings', _type: 'uiStrings', strings: [] });
if (addKeys.length) tx.patch('uiStrings', (q) => q.setIfMissing({ strings: [] }).append('strings', addKeys.map((d) => ({ _type: 'uiString', _key: key(), area: d.area, key: d.key, value: d.value }))));
for (const d of changeKeys) tx.patch('uiStrings', (q) => q.set({ [`strings[_key=="${have.get(d.key)._key}"].value`]: d.value }));
await tx.commit();
console.log(`Done: ${pages.length} pages, ${assetIds.size} photos, ${addKeys.length} new keys${useDesignCopy ? `, ${changeKeys.length} reworded keys` : ''}. Publish nothing: these are published documents; check them in the Studio.`);
