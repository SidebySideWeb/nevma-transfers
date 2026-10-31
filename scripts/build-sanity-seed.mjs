#!/usr/bin/env node
// Builds the Sanity DEMO seed: seed/sanity/data.ndjson (+ images) and seed/tem-seed.tar.gz for `sanity dataset import`.
// Run: node --experimental-strip-types scripts/build-sanity-seed.mjs
import { writeFileSync, mkdirSync, existsSync, rmSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uiStringDefaults } from '../apps/studio/schemaTypes/lib/uiStringDefaults.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'seed', 'sanity');
const DEMO_NOTE = 'DEMO content - replace with the client\'s real content before launch';

let k = 0;
const key = () => `k${(++k).toString(36).padStart(6, '0')}`;
const block = (text, style = 'normal') => ({ _type: 'block', _key: key(), style, markDefs: [], children: [{ _type: 'span', _key: key(), text, marks: [] }] });
const image = (file, alt) => ({ _type: 'image', _key: key(), _sanityAsset: `image@file://./images/${file}`, alt });
const singleImage = (file, alt) => { const { _key, ...rest } = image(file, alt); return rest; };

const docs = [];

docs.push({
  _id: 'siteSettings', _type: 'siteSettings',
  companyName: 'TEM Protection',
  tagline: 'DEMO Premium transfers and VIP security',
  phone: '+30 210 000 0000 (DEMO)',
  email: 'hello@example.com',
  bookingNotificationEmail: 'office@example.com',
  address: 'DEMO address, Athens, Greece',
  openingHours: 'DEMO: every day, 24 hours',
  timezone: 'Europe/Athens',
  defaultSeo: { _type: 'seo', title: 'TEM Protection (DEMO)', description: 'DEMO description: premium transfers and VIP security in Athens. Book online.' },
  internalNote: DEMO_NOTE,
});

docs.push({
  _id: 'uiStrings', _type: 'uiStrings',
  strings: uiStringDefaults.map((d) => ({ _type: 'uiString', _key: key(), area: d.area, key: d.key, value: d.value })),
  internalNote: DEMO_NOTE,
});

const classes = [
  { key: 'demo-sedan', name: 'DEMO Executive sedan', tagline: 'DEMO For up to 3 passengers', order: 10, specs: [['Passengers', 'Up to 3'], ['Luggage', 'Up to 3 bags'], ['Wi-Fi', 'DEMO']] },
  { key: 'demo-suv', name: 'DEMO Premium SUV', tagline: 'DEMO For up to 4 passengers', order: 20, specs: [['Passengers', 'Up to 4'], ['Luggage', 'Up to 4 bags'], ['Wi-Fi', 'DEMO']] },
  { key: 'demo-van', name: 'DEMO Executive van', tagline: 'DEMO For up to 7 passengers', order: 30, specs: [['Passengers', 'Up to 7'], ['Luggage', 'Up to 7 bags'], ['Wi-Fi', 'DEMO']] },
];
for (const c of classes) {
  docs.push({
    _id: `vehicleClass-${c.key}`, _type: 'vehicleClass', key: c.key, name: c.name, tagline: c.tagline, sortOrder: c.order,
    photos: [image(`${c.key}-1.jpg`, `DEMO photo of the ${c.name.replace('DEMO ', '').toLowerCase()}`), image(`${c.key}-2.jpg`, `DEMO interior of the ${c.name.replace('DEMO ', '').toLowerCase()}`)],
    copy: [block(`DEMO description of the ${c.name.replace('DEMO ', '').toLowerCase()}. The client supplies the real wording and photos.`)],
    specs: c.specs.map(([label, value]) => ({ _type: 'spec', _key: key(), label, value })),
    seo: { _type: 'seo', title: `${c.name} (DEMO)`, description: 'DEMO vehicle class description.' },
    internalNote: DEMO_NOTE,
  });
}

docs.push({
  _id: 'page-home', _type: 'page', kind: 'home', title: 'Home', slug: { _type: 'slug', current: 'home' },
  sections: [
    { _type: 'hero', _key: key(), heading: 'DEMO Arrive on time. Travel protected.', subheading: 'DEMO Premium transfers and hourly chauffeur service in Athens, with optional VIP security.', image: singleImage('demo-hero.jpg', 'DEMO photo of a vehicle at night'), ctaLabel: 'Book now', ctaTarget: 'book' },
    { _type: 'richText', _key: key(), heading: 'DEMO Why TEM Protection', body: [block('DEMO paragraph about the service promise. Replace with the client\'s copy.')] },
    { _type: 'faq', _key: key(), heading: 'DEMO Questions', items: [
      { _type: 'faqItem', _key: key(), question: 'DEMO How is the price set?', answer: 'DEMO Fixed prices per area and vehicle, shown before you pay.' },
      { _type: 'faqItem', _key: key(), question: 'DEMO Can I cancel?', answer: 'DEMO Yes, from the link in your confirmation email, within the cancellation window.' },
    ] },
    { _type: 'ctaBand', _key: key(), heading: 'DEMO Ready to book?', text: 'DEMO Choose your trip and pay securely online.', ctaLabel: 'Book now', ctaTarget: 'book' },
  ],
  seo: { _type: 'seo', title: 'TEM Protection (DEMO)', description: 'DEMO home description.' },
  internalNote: DEMO_NOTE,
});

for (const [slug, title] of [['privacy', 'Privacy policy'], ['cookies', 'Cookie policy'], ['terms', 'Terms of service'], ['cancellation', 'Cancellation and refunds']]) {
  docs.push({
    _id: `page-${slug}`, _type: 'page', kind: 'legal', title, slug: { _type: 'slug', current: slug },
    sections: [{ _type: 'richText', _key: key(), heading: title, body: [block(`DEMO ${title.toLowerCase()} text. The client supplies the final legal text (due Fri 4 Dec).`)] }],
    seo: { _type: 'seo', title: `${title} (DEMO)`, noindex: false },
    internalNote: DEMO_NOTE,
  });
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'data.ndjson'), docs.map((d) => JSON.stringify(d)).join('\n') + '\n');

// Tarball in Sanity's import layout: tem-seed/data.ndjson + tem-seed/images/*
if (!existsSync(join(out, 'images'))) throw new Error('seed/sanity/images is missing; generate the DEMO images first');
const stage = join(root, 'seed', '.stage', 'tem-seed');
rmSync(join(root, 'seed', '.stage'), { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(join(out, 'data.ndjson'), join(stage, 'data.ndjson'));
cpSync(join(out, 'images'), join(stage, 'images'), { recursive: true });
execFileSync('tar', ['-czf', join(root, 'seed', 'tem-seed.tar.gz'), '-C', join(root, 'seed', '.stage'), 'tem-seed']);
rmSync(join(root, 'seed', '.stage'), { recursive: true, force: true });
console.log(`Wrote ${docs.length} documents and seed/tem-seed.tar.gz`);
