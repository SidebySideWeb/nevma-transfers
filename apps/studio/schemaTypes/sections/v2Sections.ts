// Elite Protection V2 page sections: one type per block of the V2 design.
// Each type maps 1:1 to a block in design/v2/build/*.html (marked with data-block="<type>")
// and to one Astro component in apps/web/src/components/v2/blocks/. See docs/DESIGN-V2-BLOCKS.md.
import { defineArrayMember, defineField, defineType } from 'sanity';
import { altField, imageOptions } from '../lib/imageWithAlt';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = (Rule: any) => Rule.required();

// ---- shared objects ----

/** A V2 display heading: plain words, then words in gold italics, then plain words again. */
export const displayHeading = defineType({
  name: 'displayHeading',
  title: 'Heading',
  type: 'object',
  description: 'The design sets part of each heading in gold italics. Example: "Discreet luxury," + "door to door."',
  fields: [
    defineField({ name: 'before', title: 'Plain words (first)', type: 'string', validation: req }),
    defineField({ name: 'accent', title: 'Gold italic words', type: 'string' }),
    defineField({ name: 'after', title: 'Plain words (after the italic part)', type: 'string' }),
  ],
  preview: { select: { a: 'before', b: 'accent', c: 'after' }, prepare: ({ a, b, c }) => ({ title: [a, b && `*${b}*`, c].filter(Boolean).join(' ') }) },
});

export const LINK_TARGETS = [
  { title: 'Booking page (/book)', value: 'book' },
  { title: 'Request a transfer (/request-a-transfer)', value: 'quote' },
  { title: 'Fleet (/fleet)', value: 'fleet' },
  { title: 'Services (/services)', value: 'services' },
  { title: 'VIP Security (/vip-security)', value: 'vipSecurity' },
  { title: 'About (/about)', value: 'about' },
  { title: 'Contact (/contact)', value: 'contact' },
  { title: 'Find my booking (/booking/find)', value: 'findBooking' },
  { title: 'Office phone (tel: link from Site settings)', value: 'phone' },
  { title: 'Other link', value: 'url' },
] as const;

export const ctaLink = defineType({
  name: 'ctaLink',
  title: 'Button',
  type: 'object',
  fields: [
    defineField({ name: 'label', title: 'Label', type: 'string', description: 'For a phone button, {phone} is replaced by the office number.', validation: req }),
    defineField({ name: 'target', title: 'Goes to', type: 'string', options: { list: [...LINK_TARGETS] }, initialValue: 'book', validation: req }),
    defineField({ name: 'url', title: 'Other link', type: 'string', description: 'A path on this site (/about#clients) or a full URL', hidden: ({ parent }) => parent?.target !== 'url' }),
  ],
  preview: { select: { title: 'label', subtitle: 'target' } },
});

const img = (name = 'image', title = 'Photo', required = true) =>
  defineField({ name, title, type: 'image', options: imageOptions, fields: [altField], validation: required ? req : undefined });
const eyebrow = defineField({ name: 'eyebrow', title: 'Small gold label above the heading', type: 'string' });
const heading = (required = true) => defineField({ name: 'heading', title: 'Heading', type: 'displayHeading', validation: required ? req : undefined });
const lead = defineField({ name: 'lead', title: 'Intro text', type: 'text', rows: 3 });
const primary = defineField({ name: 'primary', title: 'Main button', type: 'ctaLink' });
const secondary = defineField({ name: 'secondary', title: 'Second button', type: 'ctaLink' });
const titleText = (name: string, title: string, extra: ReturnType<typeof defineField>[] = []) =>
  defineArrayMember({
    type: 'object', name, title,
    fields: [
      defineField({ name: 'title', title: 'Title', type: 'string', validation: req }),
      defineField({ name: 'text', title: 'Text', type: 'text', rows: 2 }),
      ...extra,
    ],
    preview: { select: { title: 'title', subtitle: 'text' } },
  });
const items = (of: ReturnType<typeof defineArrayMember>, min: number, max: number, name = 'items', title = 'Items') =>
  defineField({ name, title, type: 'array', of: [of], validation: (Rule) => Rule.min(min).max(max) });
const strings = (name: string, title: string, min = 1, max = 12) =>
  defineField({ name, title, type: 'array', of: [defineArrayMember({ type: 'string' })], validation: (Rule) => Rule.min(min).max(max) });
const layout = (list: [string, string][], initial: string) =>
  defineField({ name: 'layout', title: 'Layout', type: 'string', options: { list: list.map(([value, title]) => ({ value, title })), layout: 'radio' }, initialValue: initial, validation: req });
const section = (name: string, title: string, fields: ReturnType<typeof defineField>[], designRef: string) =>
  defineType({
    name, title, type: 'object', fields,
    description: `V2 design block. Looks like: ${designRef}`,
    preview: {
      select: { h: 'heading.before', a: 'heading.accent', e: 'eyebrow' },
      prepare: ({ h, a, e }) => ({ title: [h, a].filter(Boolean).join(' ') || e || title, subtitle: title }),
    },
  });

// ---- blocks ----

export const pageHero = section('pageHero', 'Page hero', [
  layout([['home', 'Home: full height, with the quick-booking widget'], ['page', 'Page: photo and heading'], ['status', 'Status page: shorter']], 'page'),
  eyebrow, heading(), lead, img('image', 'Background photo'), primary, secondary,
  defineField({ name: 'showQuickBooking', title: 'Show the quick-booking widget', type: 'boolean', initialValue: false, hidden: ({ parent }) => parent?.layout !== 'home' }),
  defineField({ name: 'widgetNote', title: 'Note under the widget', type: 'string', hidden: ({ parent }) => !parent?.showQuickBooking }),
  defineField({ name: 'badge', title: 'Badge (for example 24/7)', type: 'string' }),
], '01-home, 02-fleet, 04-services, 05-vip-security, 06-about, 07-contact, 12-request-transfer (first section)');

export const promiseStrip = section('promiseStrip', 'Promise strip', [
  items(titleText('promise', 'Promise', [defineField({ name: 'mark', title: 'Symbol (24, €, ✓, §)', type: 'string', validation: (Rule) => Rule.required().max(3) })]), 2, 4),
], '01-home, the strip under the hero');

export const divisionCards = section('divisionCards', 'Two divisions', [
  layout([['home', 'Home: heading and two photo cards'], ['about', 'About: two photo cards only']], 'home'),
  eyebrow, heading(false), lead,
  items(defineArrayMember({
    type: 'object', name: 'divisionCard', title: 'Card',
    fields: [
      defineField({ name: 'label', title: 'Small label (01 / VIP Transfer)', type: 'string', validation: req }),
      defineField({ name: 'title', title: 'Title', type: 'string', validation: req }),
      defineField({ name: 'text', title: 'Text', type: 'text', rows: 2 }),
      defineField({ name: 'link', title: 'Link', type: 'ctaLink', validation: req }),
      img(),
    ],
    preview: { select: { title: 'title', subtitle: 'label', media: 'image' } },
  }), 2, 2, 'cards', 'Cards'),
], '01-home "Two divisions, one standard"; 06-about second section');

export const fleetShowcase = section('fleetShowcase', 'Fleet showcase (home)', [
  eyebrow, heading(), lead,
  defineField({ name: 'compareLabel', title: 'Link to the fleet page', type: 'string', validation: req }),
  defineField({ name: 'bookLabel', title: 'Button: book ({name} is the vehicle)', type: 'string', validation: req }),
  defineField({ name: 'detailsLabel', title: 'Button: vehicle details', type: 'string', validation: req }),
  defineField({ name: 'footnote', title: 'Footnote', type: 'string' }),
], '01-home "The fleet". Vehicles, photos and prices come from the vehicle classes and the booking database.');

export const howItWorks = section('howItWorks', 'How booking works', [
  eyebrow, heading(), items(titleText('step', 'Step'), 3, 4, 'steps', 'Steps'),
], '01-home "How booking works" (numbered i. to iv.)');

export const onBoard = section('onBoard', 'On board', [
  layout([['feature', 'Photo with badge and four items (home)'], ['grid', 'Four columns (vehicle page)']], 'feature'),
  defineField({ name: 'badgeValue', title: 'Badge value (24/7)', type: 'string', hidden: ({ parent }) => parent?.layout !== 'feature' }),
  defineField({ name: 'badgeLabel', title: 'Badge label', type: 'string', hidden: ({ parent }) => parent?.layout !== 'feature' }),
  eyebrow, heading(), lead, img('image', 'Photo', false),
  items(titleText('amenity', 'Item'), 2, 4),
], '01-home "On board"; 03-vehicle "On board"');

export const quoteBlock = section('quoteBlock', 'Quote', [
  defineField({ name: 'quote', title: 'Quote', type: 'text', rows: 3, validation: req }),
  defineField({ name: 'caption', title: 'Caption', type: 'string' }),
], '01-home "Our promise"');

export const ctaPanel = section('ctaPanel', 'Call to action', [
  layout([['large', 'Large, centred (home)'], ['compact', 'Compact band (services)'], ['escort', 'Security escort band (vehicle page)']], 'large'),
  eyebrow, heading(), lead, primary, secondary, img('image', 'Background photo (compact layout)', false),
], '01-home "Ready when you are"; 04-services last section; 03-vehicle "VIP Transfer + VIP Security"');

export const fleetBrowser = section('fleetBrowser', 'Fleet list with filters', [
  defineField({ name: 'allLabel', title: 'Filter: all', type: 'string', validation: req }),
  defineField({ name: 'vansLabel', title: 'Filter: vans', type: 'string', validation: req }),
  defineField({ name: 'saloonsLabel', title: 'Filter: saloons', type: 'string', validation: req }),
  defineField({ name: 'note', title: 'Note beside the filters', type: 'string' }),
  defineField({ name: 'airportLabel', title: 'Label: airport price', type: 'string', validation: req }),
  defineField({ name: 'hourlyLabel', title: 'Label: hourly price ({hours} is replaced)', type: 'string', validation: req }),
  defineField({ name: 'detailsLabel', title: 'Button: details', type: 'string', validation: req }),
  defineField({ name: 'bookLabel', title: 'Button: book', type: 'string', validation: req }),
], '02-fleet first content section');

export const galleryMosaic = section('galleryMosaic', 'Photo mosaic', [
  eyebrow, heading(), defineField({ name: 'link', title: 'Link', type: 'ctaLink' }),
  defineField({
    name: 'tiles', title: 'Tiles', type: 'array', validation: (Rule) => Rule.min(4).max(8),
    of: [defineArrayMember({
      type: 'object', name: 'mosaicTile', title: 'Tile',
      fields: [img(), defineField({ name: 'caption', title: 'Caption', type: 'string', validation: req }),
        defineField({ name: 'size', title: 'Size', type: 'string', options: { list: ['normal', 'wide', 'tall', 'large'], layout: 'radio' }, initialValue: 'normal' })],
      preview: { select: { title: 'caption', media: 'image' } },
    })],
  }),
], '02-fleet "In detail"');

const noteBlock = defineArrayMember({ type: 'block', styles: [{ title: 'Normal', value: 'normal' }], lists: [], marks: { decorators: [{ title: 'Strong', value: 'strong' }], annotations: [] } });

export const priceTable = section('priceTable', 'Price table', [
  eyebrow, heading(), defineField({ name: 'link', title: 'Link', type: 'ctaLink' }),
  defineField({ name: 'columns', title: 'Column labels', type: 'object', fields: ['vehicle', 'type', 'seats', 'luggage', 'airport', 'hourly', 'minimum'].map((n) => defineField({ name: n, title: n, type: 'string', validation: req })) }),
  defineField({ name: 'notes', title: 'Notes under the table', type: 'array', of: [noteBlock] }),
], '02-fleet "Price list". Rows come from the vehicle classes and the booking database.');

export const includedList = section('includedList', 'Included in every journey', [
  eyebrow, strings('items', 'Items', 3, 8),
  defineField({ name: 'addOnLabel', title: 'Add-on label', type: 'string' }),
  defineField({ name: 'addOnTitle', title: 'Add-on title', type: 'string' }),
  defineField({ name: 'addOnText', title: 'Add-on text', type: 'string' }),
  defineField({ name: 'addOnLink', title: 'Add-on link', type: 'ctaLink' }),
  img('image', 'Add-on photo', false),
], '02-fleet last section');

export const bookingOptions = section('bookingOptions', 'Booking options', [
  eyebrow, heading(),
  items(titleText('bookingOption', 'Option', [defineField({ name: 'priceNote', title: 'Price note ({from} = lowest price, or text such as "On request")', type: 'string' })]), 2, 4, 'options', 'Options'),
], '04-services "Booking options"');

export const featuredRoute = section('featuredRoute', 'Featured route', [
  eyebrow, heading(), lead,
  defineField({ name: 'route', title: 'Route (prices come from the booking database)', type: 'reference', to: [{ type: 'route' }], validation: req }),
  img(), defineField({ name: 'note', title: 'Note under the prices', type: 'string' }),
  defineField({ name: 'noteLink', title: 'Link in the note', type: 'ctaLink' }), primary, secondary,
], '04-services "Featured route"');

export const occasions = section('occasions', 'Occasions', [
  eyebrow, heading(), items(titleText('occasion', 'Occasion', [img()]), 3, 3),
], '04-services "Where we take you"');

export const faqList = section('faqList', 'Questions and answers', [
  eyebrow, heading(), lead,
  defineField({ name: 'showPhone', title: 'Add the office phone after the intro', type: 'boolean', initialValue: true }),
  defineField({
    name: 'items', title: 'Questions', type: 'array', validation: (Rule) => Rule.min(1).max(12),
    of: [defineArrayMember({ type: 'object', name: 'faqEntry', fields: [defineField({ name: 'question', title: 'Question', type: 'string', validation: req }), defineField({ name: 'answer', title: 'Answer', type: 'text', rows: 3, validation: req })], preview: { select: { title: 'question' } } })],
  }),
], '04-services "Good to know"');

export const featureTrio = section('featureTrio', 'Three points', [
  layout([['band', 'Band under the hero (VIP Security)'], ['section', 'Section with heading (About, Our people)']], 'band'),
  eyebrow, heading(false), lead, items(titleText('point', 'Point'), 3, 3),
], '05-vip-security under the hero; 06-about "Our people"');

export const serviceColumns = section('serviceColumns', 'Service columns', [
  eyebrow, heading(),
  defineField({
    name: 'columns', title: 'Columns', type: 'array', validation: (Rule) => Rule.min(2).max(2),
    of: [defineArrayMember({ type: 'object', name: 'serviceColumn', fields: [eyebrow, defineField({ name: 'title', title: 'Title', type: 'string', validation: req }), strings('bullets', 'Bullets', 1, 8)], preview: { select: { title: 'title', subtitle: 'eyebrow' } } })],
  }),
], '05-vip-security "Services"');

export const escortFeature = section('escortFeature', 'Protection on the move', [
  eyebrow, heading(), lead, img(), strings('points', 'Numbered points', 2, 4), primary, secondary,
], '05-vip-security "Protection on the move"');

export const statsBar = section('statsBar', 'Figures', [
  defineField({ name: 'items', title: 'Figures', type: 'array', validation: (Rule) => Rule.min(2).max(4),
    of: [defineArrayMember({ type: 'object', name: 'stat', fields: [defineField({ name: 'value', title: 'Value', type: 'string', validation: req }), defineField({ name: 'label', title: 'Label', type: 'string', validation: req })], preview: { select: { title: 'value', subtitle: 'label' } } })] }),
], '06-about under the hero');

export const clientsBlock = section('clientsBlock', 'Clients', [
  eyebrow, heading(), lead, defineField({ name: 'body', title: 'Second paragraph', type: 'text', rows: 3 }), img(), primary, secondary,
], '06-about "Clients"');

export const contactCards = section('contactCards', 'Contact cards', [
  defineField({ name: 'callLabel', title: 'Label: phones', type: 'string', validation: req }),
  defineField({ name: 'emailLabel', title: 'Label: email', type: 'string', validation: req }),
  defineField({ name: 'emailNote', title: 'Note under the email', type: 'string' }),
  defineField({ name: 'officeLabel', title: 'Label: office', type: 'string', validation: req }),
  defineField({ name: 'officeNote', title: 'Note under the address', type: 'string' }),
], '07-contact first section. Phones, email and address come from Site settings.');

export const enquiryForm = section('enquiryForm', 'Form with side panel', [
  layout([['security', 'Confidential enquiry (VIP Security)'], ['contact', 'Send a message (Contact)'], ['request', 'Request a transfer']], 'contact'),
  eyebrow, heading(false), lead,
  defineField({ name: 'form', title: 'Form', type: 'reference', to: [{ type: 'form' }], validation: req }),
  defineField({ name: 'asideBadge', title: 'Side panel: badge (24/7)', type: 'string' }),
  defineField({ name: 'asideTitle', title: 'Side panel: title', type: 'string' }),
  defineField({ name: 'asideNote', title: 'Side panel: note', type: 'text', rows: 2 }),
  strings('asideSteps', 'Side panel: numbered steps (request layout)', 0, 4),
  defineField({ name: 'asideLink', title: 'Side panel: link', type: 'ctaLink' }),
  defineField({ name: 'mapLabel', title: 'Map placeholder label (contact layout)', type: 'string' }),
], '05-vip-security "Confidential enquiry"; 07-contact "Send a message"; 12-request-transfer form');

export const legalDocument = section('legalDocument', 'Legal document', [
  heading(),
  defineField({ name: 'body', title: 'Text', type: 'array', of: [defineArrayMember({
    type: 'block', styles: [{ title: 'Normal', value: 'normal' }, { title: 'Subheading', value: 'h3' }], lists: [{ title: 'Bullet', value: 'bullet' }],
    marks: { decorators: [{ title: 'Strong', value: 'strong' }], annotations: [{ name: 'link', type: 'object', title: 'Link', fields: [{ name: 'href', type: 'string', title: 'URL or path' }] }] },
  })], validation: req }),
], '17-legal, one document per legal page with the side navigation');

/** Every V2 section type, in the order they appear in the Studio "Add item" menu. */
export const v2SectionTypes = [
  pageHero, promiseStrip, divisionCards, fleetShowcase, howItWorks, onBoard, quoteBlock, ctaPanel,
  fleetBrowser, galleryMosaic, priceTable, includedList, bookingOptions, featuredRoute, occasions, faqList,
  featureTrio, serviceColumns, escortFeature, statsBar, clientsBlock, contactCards, enquiryForm, legalDocument,
];
export const v2SectionNames = v2SectionTypes.map((t) => t.name);
export const v2SharedTypes = [displayHeading, ctaLink];
