#!/usr/bin/env node
// Builds the Sanity DEMO seed: seed/sanity/data.ndjson (+ images) and seed/tem-seed.tar.gz for `sanity dataset import`.
// Run: node --experimental-strip-types scripts/build-sanity-seed.mjs
import { writeFileSync, mkdirSync, existsSync, rmSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uiStringDefaults } from '../apps/studio/schemaTypes/lib/uiStringDefaults.ts';
import { v2Pages } from './v2-content.mjs';

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
  companyName: 'Elite Protection',
  tagline: 'VIP Transfer and VIP Security in Athens',
  phone: '+30 210 970 6967',
  mobilePhone: '+30 698 181 0410',
  email: 'info@eliteprotection.gr',
  bookingNotificationEmail: 'office@example.com',
  address: '[Office address, Athens]',
  openingHours: 'DEMO: every day, 24 hours',
  timezone: 'Europe/Athens',
  showFromPrices: true,
  defaultSeo: { _type: 'seo', title: 'Elite Protection (DEMO)', description: 'DEMO description: premium transfers and VIP security in Athens. Book online.' },
  internalNote: DEMO_NOTE,
});

docs.push({
  _id: 'uiStrings', _type: 'uiStrings',
  strings: uiStringDefaults.map((d) => ({ _type: 'uiString', _key: key(), area: d.area, key: d.key, value: d.value })),
  internalNote: DEMO_NOTE,
});

// Fleet from the Elite Protection V2 design (design/v2/pages/02-fleet.html). Capacities and copy are indicative
// until the client confirms them (O3); photos come from the design and must be replaced where not licensed.
const PHOTO_NOTE = 'DEMO: copy and capacities from the V2 design, to confirm with the client. Photos from the design preview: replace any that are not owned or licensed before launch.';
const classes = [
  { key: 'demo-e-class', name: 'E-Class', kind: 'Saloon', order: 10, seats: 'Up to 3', bags: 'Up to 2', blurb: 'Understated business travel, ideal for one to three passengers.',
    photos: [['e-class-ext.jpg', 'Black Mercedes-Benz E-Class saloon, side view'], ['e-class-int.jpg', 'E-Class rear seats in black leather'], ['e-class-int2.jpg', 'E-Class cabin and dashboard']] },
  { key: 'demo-s-class', name: 'S-Class', kind: 'Executive saloon', order: 20, seats: 'Up to 3', bags: 'Up to 2', blurb: 'Privacy and prestige: a premium experience with an understated presence.',
    photos: [['s-class-terminal.jpg', 'Black S-Class waiting outside an airport terminal'], ['s-class-ext.jpg', 'Black Mercedes-Benz S-Class, side view'], ['s-class-front.jpg', 'S-Class front view'], ['s-class-int.jpg', 'S-Class rear cabin'], ['s-class-dash.jpg', 'S-Class dashboard at night'], ['s-class-city.jpg', 'S-Class in the city']] },
  { key: 'demo-v-class', name: 'V-Class', kind: 'Luxury van', order: 30, seats: 'Up to 7', bags: 'Up to 6', blurb: 'Space and comfort for families and small groups, with generous room for luggage.',
    photos: [['v-class-street.jpg', 'Black Mercedes-Benz V-Class on a city street'], ['v-class-london.jpg', 'V-Class outside a hotel'], ['v-class-cabin.jpg', 'V-Class cabin with facing leather seats'], ['v-class-9.jpg', 'V-Class seating for passengers'], ['v-class-lounge.jpg', 'V-Class lounge seating'], ['v-class-chauffeur.jpg', 'Chauffeur opening the V-Class door'], ['v-class-drive.jpg', 'V-Class on the road'], ['v-class-dash.jpg', 'V-Class dashboard'], ['v-class-night.jpg', 'V-Class at night'], ['v-class-marina.jpg', 'V-Class at a marina']] },
  { key: 'demo-vito', name: 'Vito', kind: 'Van', order: 40, seats: 'Up to 8', bags: 'Up to 6', blurb: 'A practical, comfortable van for groups and airport runs with plenty of luggage.',
    photos: [['vito-ext.jpg', 'Black Mercedes-Benz Vito van']] },
  { key: 'demo-sprinter', name: 'Sprinter', kind: 'VIP van', order: 50, seats: 'Up to 12', bags: 'Up to 10', blurb: 'A lounge on wheels for larger groups, delegations and events.',
    photos: [['sprinter-ext.jpg', 'Black Mercedes-Benz Sprinter VIP van'], ['sprinter-2.jpg', 'Sprinter VIP lounge seating'], ['sprinter-1.jpg', 'Sprinter cabin'], ['sprinter-3.jpg', 'Sprinter interior lighting']] },
];
for (const c of classes) {
  docs.push({
    _id: `vehicleClass-${c.key}`, _type: 'vehicleClass', key: c.key, name: c.name, fullName: `Mercedes-Benz ${c.name}`, tagline: c.kind, sortOrder: c.order,
    group: /van/i.test(c.kind) ? 'van' : 'saloon',
    amenities: ['Wi-Fi on board', 'Bottled water', 'Device charging', 'Air conditioning', 'Luggage assistance'],
    photos: c.photos.map(([file, alt]) => image(file, alt)),
    copy: [block(c.blurb)],
    specs: [['Passengers', c.seats], ['Luggage', c.bags], ['Type', c.kind]].map(([label, value]) => ({ _type: 'spec', _key: key(), label, value })),
    seo: { _type: 'seo', title: `${c.name} with chauffeur in Athens`, description: c.blurb },
    internalNote: PHOTO_NOTE,
  });
}

// ---------------- kit 2: forms, routes, standard pages ----------------
const ref = (id) => ({ _type: 'reference', _ref: id });
const keyed = (o) => ({ _key: key(), ...o });

docs.push({
  _id: 'form-transfer-request', _type: 'form', key: 'transfer-request', title: 'Request a transfer',
  intro: 'DEMO For trips we cannot price online, groups, or special requests. We reply with a quote.',
  recipientEmail: 'office@example.com', successTitle: 'Thank you, we received your request',
  successMessage: 'DEMO We will reply with a quote as soon as we can. A copy is on its way to your inbox.', retentionMonths: 24,
  internalNote: DEMO_NOTE,
});
docs.push({
  _id: 'form-vip-security', _type: 'form', key: 'vip-security', title: 'VIP security enquiry',
  intro: 'DEMO Tell us about your event or trip and we will get back to you.',
  recipientEmail: 'security@example.com', successTitle: 'Thank you, we received your enquiry',
  successMessage: 'DEMO Our security desk will contact you shortly.', retentionMonths: 24,
  internalNote: DEMO_NOTE,
});
docs.push({
  _id: 'form-contact', _type: 'form', key: 'contact', title: 'Contact us',
  intro: 'DEMO Questions about a booking, our services or a partnership.',
  recipientEmail: 'office@example.com',
  topics: [
    { _type: 'formTopic', _key: key(), key: 'booking', label: 'An existing booking' },
    { _type: 'formTopic', _key: key(), key: 'services', label: 'Our services' },
    { _type: 'formTopic', _key: key(), key: 'vip-security', label: 'VIP security', recipientEmail: 'security@example.com' },
    { _type: 'formTopic', _key: key(), key: 'partnership', label: 'Partnership' },
    { _type: 'formTopic', _key: key(), key: 'other', label: 'Something else' },
  ],
  successTitle: 'Thank you for your message', successMessage: 'DEMO We will reply as soon as we can.', retentionMonths: 24,
  internalNote: DEMO_NOTE,
});

const routes = [
  { slug: 'athens-airport-to-city-centre', title: 'DEMO Athens Airport to the city centre', from: 'demo-airport', to: 'demo-centre', photo: 's-class-terminal.jpg', featured: true, order: 10 },
  { slug: 'athens-airport-to-piraeus-port', title: 'DEMO Athens Airport to Piraeus port', from: 'demo-airport', to: 'demo-port', photo: 'v-class-marina.jpg', featured: true, order: 20 },
  { slug: 'city-centre-to-athens-airport', title: 'DEMO City centre to Athens Airport', from: 'demo-centre', to: 'demo-airport', photo: 's-class-terminal.jpg', featured: true, order: 30 },
  { slug: 'northern-suburbs-to-piraeus-port', title: 'DEMO Northern suburbs to Piraeus port', from: 'demo-north', to: 'demo-port', photo: 'v-class-marina.jpg', featured: false, order: 40 },
];
for (const r of routes) {
  docs.push({
    _id: `route-${r.slug}`, _type: 'route', title: r.title, slug: { _type: 'slug', current: r.slug },
    fromZone: r.from, toZone: r.to,
    intro: `DEMO A fixed-price private transfer for this trip. The client supplies the real description.`,
    body: [block('DEMO What to expect: meeting point, waiting time, luggage. Replace with the client\'s copy.')],
    photo: singleImage(r.photo, `DEMO photo for ${r.title.replace('DEMO ', '')}`),
    faq: [
      { _type: 'faqItem', _key: key(), question: 'DEMO How long does the trip take?', answer: 'DEMO The duration shown is typical; traffic may change it.' },
      { _type: 'faqItem', _key: key(), question: 'DEMO Is the price fixed?', answer: 'DEMO Yes, the price you see when booking is the price you pay.' },
    ],
    featured: r.featured, sortOrder: r.order,
    seo: { _type: 'seo', title: `${r.title} (DEMO)`, description: 'DEMO route description.' },
    internalNote: DEMO_NOTE,
  });
}

// ---------------- pages: every block and line of the V2 design (scripts/v2-content.mjs) ----------------
for (const p of v2Pages({ key, img: singleImage, ref, block })) {
  docs.push({
    _id: `page-${p.slug}`, _type: 'page', kind: p.kind, title: p.title, slug: { _type: 'slug', current: p.slug },
    sections: p.sections.map((s) => ({ _key: key(), ...s })),
    seo: { _type: 'seo', title: p.seoTitle, description: p.seoDescription },
    internalNote: `${DEMO_NOTE}. Text from the V2 design; prices shown as final prices (VAT included).`,
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
