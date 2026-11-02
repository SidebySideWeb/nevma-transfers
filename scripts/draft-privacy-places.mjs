/**
 * Draft (do not publish) the address-autocomplete privacy sentence onto page-privacy.
 * Usage: node scripts/draft-privacy-places.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'apps/web/package.json'));
const { createClient } = require('@sanity/client');

const envPath = resolve(root, 'apps/web/.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const SENTENCE =
  'When you type an address, the text is sent to Google (Google Maps Platform) to suggest places. We store the address you confirm and, if you pick a suggestion, its Google place reference and map coordinates with your booking.';

const client = createClient({
  projectId: env.SANITY_PROJECT_ID,
  dataset: env.SANITY_DATASET,
  token: env.SANITY_WRITE_TOKEN,
  apiVersion: '2025-01-01',
  useCdn: false,
});

const published = await client.fetch(
  `*[_type == "page" && slug.current == "privacy"][0]{_id, title, sections}`,
);
if (!published?._id) {
  console.error('No privacy page found');
  process.exit(1);
}

const draftId = published._id.startsWith('drafts.') ? published._id : `drafts.${published._id}`;
const existing = await client.getDocument(draftId).catch(() => null);
const base = existing || published;
const sections = Array.isArray(base.sections) ? structuredClone(base.sections) : [];
const legal = sections.find((s) => s?._type === 'legalDocument');
if (!legal) {
  console.error('No legalDocument section on privacy page');
  process.exit(1);
}
const body = Array.isArray(legal.body) ? legal.body : (legal.body = []);
if (JSON.stringify(body).includes('Google Maps Platform')) {
  console.log(`Already present on ${draftId}. Open Studio → Privacy (draft). Do not publish yet.`);
  process.exit(0);
}
body.push({
  _type: 'block',
  _key: 'placesPrivacy',
  style: 'normal',
  markDefs: [],
  children: [{ _type: 'span', _key: 'placesPrivacySpan', text: SENTENCE, marks: [] }],
});

const { _rev, ...rest } = base;
await client.createOrReplace({
  ...rest,
  _id: draftId,
  _type: 'page',
  sections,
});
console.log(`Drafted privacy sentence on ${draftId}. Review in Studio; do not publish until you approve.`);
