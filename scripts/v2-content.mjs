// All page text of the Elite Protection V2 design, as Sanity page documents.
// Source: design/v2/build/*.html (the exact V2 pages). One section per design block, in page order.
// Intentional differences from the design copy (decisions log): prices are shown as final prices with
// 24% VAT included, so every "exclusive of 24% VAT" line says "VAT included" instead, and prices are
// placeholders filled from the booking database ({fromTransfer}, {fromHourly}).
// Used by scripts/build-sanity-seed.mjs; checked by scripts/v2-content.test.mjs.

export const V2_VAT_NOTE = 'VAT included';

/**
 * @param {{ key: () => string, img: (file: string, alt: string) => object, ref: (id: string) => object, block: (text: string, style?: string) => object }} h
 * @returns {Array<{ slug: string, kind: string, title: string, seoTitle: string, seoDescription: string, sections: object[] }>}
 */
export function v2Pages(h) {
  const { img, ref } = h;
  const H = (before, accent, after) => ({ _type: 'displayHeading', before, ...(accent ? { accent } : {}), ...(after ? { after } : {}) });
  const L = (label, target, url) => ({ _type: 'ctaLink', label, target, ...(url ? { url } : {}) });
  const tt = (_type, title, text, extra = {}) => ({ _type, _key: h.key(), title, ...(text ? { text } : {}), ...extra });
  const pb = (parts) => ({ _type: 'block', _key: h.key(), style: 'normal', markDefs: [], children: parts.map(([text, strong]) => ({ _type: 'span', _key: h.key(), text, marks: strong ? ['strong'] : [] })) });

  const home = {
    slug: 'home', kind: 'home', title: 'Home',
    seoTitle: 'VIP transfers and security in Athens | Elite Protection',
    seoDescription: 'Chauffeured Mercedes-Benz transfers across Athens, with optional close-protection escorts. Fixed final prices, available around the clock.',
    sections: [
      { _type: 'pageHero', layout: 'home', eyebrow: 'VIP Transfer · VIP Security · Athens', heading: H('Discreet luxury,', 'door to door.'),
        lead: 'Chauffeured Mercedes-Benz transfers across Athens, with optional close-protection escorts. Fixed prices, available around the clock.',
        image: img('brand-vclass-acropolis.jpg', 'Mercedes-Benz V-Class below the Acropolis'),
        primary: L('Book a transfer', 'book'), secondary: L('Explore the fleet', 'fleet'),
        showQuickBooking: true, widgetNote: 'Fixed prices per vehicle · Your car is held for 20 minutes while you book · Prices include 24% VAT' },
      { _type: 'promiseStrip', items: [
        tt('promise', 'Available 24/7', 'Office and chauffeurs, day and night', { mark: '24' }),
        tt('promise', 'Fixed prices', 'Per vehicle, shown before you book', { mark: '€' }),
        tt('promise', 'Pay securely online', 'Hosted card payment, instant confirmation', { mark: '✓' }),
        tt('promise', 'Absolute discretion', 'Your identity and schedule stay private', { mark: '§' }),
      ] },
      { _type: 'divisionCards', layout: 'home', eyebrow: 'Two divisions, one standard', heading: H('Travel in comfort.', 'Move with protection.'),
        lead: 'Luxury vehicles, professional chauffeurs and specialist security teams, coordinated by one office in Athens.',
        cards: [
          { _type: 'divisionCard', _key: h.key(), label: '01 / VIP Transfer', title: 'Luxury travel with a private chauffeur', text: 'Mercedes-Benz vans and saloons for airports, hotels, business and private travel.', link: L('View the fleet →', 'fleet'), image: img('v-class-london.jpg', 'Mercedes-Benz V-Class on a city street') },
          { _type: 'divisionCard', _key: h.key(), label: '02 / VIP Security', title: 'Close protection & security escorts', text: 'Discreet protection for people, premises and property, on the move or on site.', link: L('Discover VIP Security →', 'vipSecurity'), image: img('brand-security-acropolis.jpg', 'Security escort beside a vehicle below the Acropolis') },
        ] },
      { _type: 'fleetShowcase', eyebrow: 'The fleet', heading: H('Choose', 'your', 'Mercedes-Benz'),
        lead: 'Five vehicle classes, each with a fixed airport price and an hourly rate.', compareLabel: 'Compare all vehicles →', bookLabel: 'Book the {name}', detailsLabel: 'Vehicle details',
        footnote: '*Indicative capacity, to be confirmed. Prices include 24% VAT.' },
      { _type: 'howItWorks', eyebrow: 'How booking works', heading: H('Four steps.', 'No surprises.'), steps: [
        tt('step', 'Choose your route', 'Pick-up and drop-off zone, date, time and passengers.'),
        tt('step', 'Pick a vehicle', 'Fixed prices for every class. Your car is held for 20 minutes.'),
        tt('step', 'Pay securely', 'Card payment on Viva’s hosted page. Add VIP security if needed.'),
        tt('step', 'Meet your chauffeur', 'Confirmation by email, a reminder 24 hours before, chauffeur details on the day.'),
      ] },
      { _type: 'onBoard', layout: 'feature', badgeValue: '24/7', badgeLabel: 'Office & chauffeurs', eyebrow: 'On board', heading: H('Every detail', 'of hospitality'),
        lead: 'Carefully maintained interiors and a chauffeur who knows the city, so the journey is time you get back.',
        image: img('v-class-cabin.jpg', 'Leather captain seats in the V-Class cabin'), items: [
          tt('amenity', 'Wi-Fi on board', 'Stay connected for work and calls throughout the journey.'),
          tt('amenity', 'Bottled water', 'Thoughtful attention to the details of hospitality.'),
          tt('amenity', 'Device charging', 'Charging for phones and personal devices.'),
          tt('amenity', 'Luggage assistance', 'Your chauffeur meets you and handles the bags.'),
        ] },
      { _type: 'quoteBlock', quote: 'Absolute confidentiality is a core commitment. Every engagement, and every piece of information, is treated with discretion.', caption: 'Our promise' },
      { _type: 'ctaPanel', layout: 'large', eyebrow: 'Ready when you are', heading: H('Your chauffeur', 'is waiting.'),
        lead: 'Book online in a few minutes, or call our office any time of day.', primary: L('Book a transfer', 'book'), secondary: L('{phone}', 'phone') },
    ],
  };

  const fleet = {
    slug: 'fleet', kind: 'standard', title: 'Fleet & rates',
    seoTitle: 'Fleet and rates: Mercedes-Benz with chauffeur | Elite Protection',
    seoDescription: 'Five Mercedes-Benz classes with professional chauffeurs and fixed final prices for airport transfers and hourly hire in Athens.',
    sections: [
      { _type: 'pageHero', layout: 'page', eyebrow: 'VIP Transfer / Fleet & rates', heading: H('Five classes.', 'One standard.'),
        lead: 'Exclusively Mercedes-Benz, with professional chauffeurs and fixed prices for every journey.', image: img('v-class-london.jpg', 'Mercedes-Benz V-Class on a city street') },
      { _type: 'fleetBrowser', allLabel: 'All', vansLabel: 'Vans', saloonsLabel: 'Saloons',
        note: 'Prices in euros, VAT included · Capacity indicative, to be confirmed',
        airportLabel: 'Airport · one way', hourlyLabel: 'Hourly · min {hours} hours', detailsLabel: 'Details', bookLabel: 'Book' },
      { _type: 'galleryMosaic', eyebrow: 'In detail', heading: H('Inside', 'the fleet'), link: L('Browse every vehicle →', 'url', '/fleet/v-class'), tiles: [
        ['v-class-cabin.jpg', 'V-Class · VIP cabin', 'large'], ['s-class-front.jpg', 'S-Class · cabin', 'normal'], ['v-class-drive.jpg', 'V-Class · on the road', 'normal'],
        ['v-class-9.jpg', 'V-Class · captain seats', 'tall'], ['e-class-int.jpg', 'E-Class · rear seats', 'normal'], ['v-class-lounge.jpg', 'V-Class · lounge', 'normal'],
        ['s-class-dash.jpg', 'S-Class · cockpit', 'wide'], ['sprinter-1.jpg', 'Sprinter · seating', 'normal'],
      ].map(([f, c, size]) => ({ _type: 'mosaicTile', _key: h.key(), image: img(f, c.replace(' · ', ': ')), caption: c, size })) },
      { _type: 'priceTable', eyebrow: 'Price list 2026', heading: H('Compare', 'at a glance'), link: L('Check availability →', 'book'),
        columns: { vehicle: 'Vehicle', type: 'Type', seats: 'Seats*', luggage: 'Luggage*', airport: 'Airport (AIA – Athens)', hourly: 'Hourly', minimum: 'Minimum' },
        notes: [pb([['All prices in euros, '], ['VAT included', true]]), pb([['Airport rates are '], ['one-way', true], [' between AIA and Athens']]),
          pb([['Minimum hours apply to '], ['hourly chauffeur services', true]]), pb([['*Capacity indicative, to be confirmed']])] },
      { _type: 'includedList', eyebrow: 'Included in every journey',
        items: ['Professional chauffeur', 'Air conditioning', 'Wi-Fi on board', 'Bottled water', 'Device charging', 'Luggage assistance'],
        addOnLabel: 'Add-on', addOnTitle: 'Add a security escort', addOnText: 'Vehicle, chauffeur and escort team on one coordinated plan.',
        addOnLink: L('VIP Security →', 'vipSecurity'), image: img('brand-security-acropolis.jpg', 'Security escort beside a vehicle below the Acropolis') },
    ],
  };

  const services = {
    slug: 'services', kind: 'standard', title: 'Services & routes',
    seoTitle: 'Transfers, hourly and full-day chauffeur in Athens | Elite Protection',
    seoDescription: 'From a single airport run to a full day at your disposal, with or without a security escort.',
    sections: [
      { _type: 'pageHero', layout: 'page', eyebrow: 'VIP Transfer / Services & routes', heading: H('Transfers for', 'every itinerary.'),
        lead: 'From a single airport run to a full day at your disposal, with or without a security escort.', image: img('v-class-dash.jpg', 'Dashboard of a Mercedes-Benz V-Class') },
      { _type: 'bookingOptions', eyebrow: 'Booking options', heading: H('Choose', 'how you travel'), options: [
        tt('bookingOption', 'One-off transfer', 'A single journey from your pick-up point to your chosen destination.', { priceNote: 'From {fromTransfer}' }),
        tt('bookingOption', 'Transfer with waiting time', 'Your chauffeur remains available for your return or onward journey.', { priceNote: 'On request' }),
        tt('bookingOption', 'Hourly chauffeur', 'A vehicle and chauffeur at your disposal for meetings and multiple stops.', { priceNote: 'From {fromHourly} / hour' }),
        tt('bookingOption', 'Full-day chauffeur', 'A dedicated chauffeur and vehicle for your whole itinerary.', { priceNote: 'On request' }),
      ] },
      { _type: 'featuredRoute', eyebrow: 'Featured route · airport transfer', heading: H('Athens International', '↔', 'Athens'),
        lead: 'One-way journeys between AIA and Athens, with luggage assistance and your chauffeur waiting on arrival.',
        route: ref('route-athens-airport-to-city-centre'), image: img('s-class-terminal.jpg', 'S-Class waiting at the airport terminal'),
        note: 'Prices in euros, VAT included. Other zones:', noteLink: L('request a quote', 'quote'),
        primary: L('Book this route', 'book'), secondary: L('Full price list', 'fleet') },
      { _type: 'occasions', eyebrow: 'Where we take you', heading: H('For every', 'occasion'), items: [
        tt('occasion', 'Airports, ports & hotels', 'Pick-up and transfers to and from arrival points, accommodation and departures.', { image: img('chauffeur-hotel.jpg', 'Chauffeur waiting at a hotel entrance') }),
        tt('occasion', 'Business & private travel', 'Meetings, events, private appointments and journeys with multiple stops.', { image: img('e-class-int.jpg', 'Rear seats of an E-Class') }),
        tt('occasion', 'Groups & delegations', 'Scheduled returns, private tours and itineraries for larger parties.', { image: img('sprinter-2.jpg', 'Sprinter lounge seating') }),
      ] },
      { _type: 'faqList', eyebrow: 'Good to know', heading: H('Questions,', 'answered'), lead: 'Anything else? Call us any time on', showPhone: true, items: [
        ['Are the prices final?', 'Prices are fixed per vehicle and route, quoted in euros and include 24% VAT. You see the total before you pay.'],
        ['Does the airport rate cover a return journey?', 'No. Airport transfer rates apply to one-way journeys between Athens International Airport (AIA) and Athens.'],
        ['What is the minimum for a chauffeur by the hour?', 'Minimum booking hours apply to hourly chauffeur services: 4 hours for most vehicles and 3 hours for the E-Class.'],
        ['How long is my vehicle held while I book?', 'Once you choose a vehicle it is held for you for 20 minutes while you add your details and pay.'],
        ['Can I add a security escort?', 'Yes. Transfers are available with or without security escorts, working to a coordinated plan tailored to your needs.'],
        ['How do I change or cancel a booking?', 'Use the secure link in your confirmation email, or find your booking with its reference and email. For changes, call the office.'],
      ].map(([question, answer]) => ({ _type: 'faqEntry', _key: h.key(), question, answer })) },
      { _type: 'ctaPanel', layout: 'compact', heading: H('Something tailored', 'to your itinerary?'), primary: L('Request a quote', 'quote'), secondary: L('Book a transfer', 'book'),
        image: img('v-class-marina.jpg', 'V-Class at the marina') },
    ],
  };

  const vip = {
    slug: 'vip-security', kind: 'standard', title: 'VIP Security',
    seoTitle: 'VIP security and close protection in Athens | Elite Protection',
    seoDescription: 'Protection for people, premises and property through specialist personnel and modern technology.',
    sections: [
      { _type: 'pageHero', layout: 'page', eyebrow: 'VIP Security', heading: H('Close protection,', 'quietly done.'),
        lead: 'Protection for people, premises and property through specialist personnel and modern technology.',
        image: img('brand-security-acropolis.jpg', 'Security escort beside a vehicle below the Acropolis'),
        primary: L('Make a confidential enquiry', 'url', '#enquiry'), secondary: L('Call 24/7', 'phone') },
      { _type: 'featureTrio', layout: 'band', items: [
        tt('point', 'Discreet presence', 'VIP security escorts that respect your privacy and daily routine.'),
        tt('point', 'Tailored to your needs', 'Protection planned around your schedule and the requirements of each occasion.'),
        tt('point', 'Protection on the move', 'VIP protection combined with luxury transfers.'),
      ] },
      { _type: 'serviceColumns', eyebrow: 'Services', heading: H('Comprehensive', 'security services'), columns: [
        { _type: 'serviceColumn', _key: h.key(), eyebrow: 'On site', title: 'Guarding & protection', bullets: ['Static guarding for commercial, public and residential premises', 'Mobile patrols', 'Event security and VIP protection'] },
        { _type: 'serviceColumn', _key: h.key(), eyebrow: 'Systems', title: 'Technology & support', bullets: ['24-hour alarm and CCTV monitoring through an Alarm Receiving Centre', 'Security assessments', 'Installation and maintenance of alarm, CCTV and fire detection systems'] },
      ] },
      { _type: 'escortFeature', eyebrow: 'VIP Security + VIP Transfer', heading: H('Protection', 'on the move'),
        lead: 'A luxury vehicle, a professional chauffeur and a security escort team, working to one coordinated plan tailored to your schedule.',
        image: img('chauffeur-door.jpg', 'Chauffeur opening the rear door for a client'),
        points: ['Route and timing planned in advance', 'Escort team coordinated with your chauffeur', 'Bookable as an add-on to any transfer'],
        primary: L('Book a transfer with escort', 'url', '/book?vip=1'), secondary: L('View the fleet', 'fleet') },
      { _type: 'enquiryForm', layout: 'security', eyebrow: 'Confidential enquiry', heading: H('Tell us', 'what you need'),
        lead: 'Handled in confidence by our security desk. We reply by email or phone.', form: ref('form-vip-security'),
        asideBadge: '24/7', asideTitle: 'Security desk · Athens', asideNote: 'Absolute confidentiality is a core commitment.' },
    ],
  };

  const about = {
    slug: 'about', kind: 'standard', title: 'About',
    seoTitle: 'About Elite Protection: security and VIP transfers in Athens',
    seoDescription: 'Based in Athens, Elite Protection provides comprehensive security and VIP transfer services for businesses, organisations and private clients.',
    sections: [
      { _type: 'pageHero', layout: 'page', eyebrow: 'About Elite Protection', heading: H('Two divisions,', 'one company.'),
        lead: 'Based in Athens, Elite Protection provides comprehensive security and VIP transfer services for businesses, organisations and private clients.',
        image: img('s-class-dash.jpg', 'S-Class cockpit at night') },
      { _type: 'statsBar', items: [['24/7', 'Office and chauffeurs'], ['2', 'Divisions, one standard'], ['5', 'Mercedes-Benz classes'], ['[year]', 'Founded (to be supplied)']]
        .map(([value, label]) => ({ _type: 'stat', _key: h.key(), value, label })) },
      { _type: 'divisionCards', layout: 'about', cards: [
        { _type: 'divisionCard', _key: h.key(), label: 'VIP Security', title: 'Protection for people, premises and property', text: 'Static guarding, mobile patrols, event security and VIP protection, with 24-hour alarm and CCTV monitoring.', link: L('VIP Security →', 'vipSecurity'), image: img('brand-security-acropolis.jpg', 'Security escort beside a vehicle below the Acropolis') },
        { _type: 'divisionCard', _key: h.key(), label: 'VIP Transfer', title: 'Premium transfers in Mercedes-Benz vans and saloons', text: 'Professional chauffeurs, carefully maintained vehicles and optional security escorts.', link: L('The fleet →', 'fleet'), image: img('v-class-london.jpg', 'Mercedes-Benz V-Class on a city street') },
      ] },
      { _type: 'featureTrio', layout: 'section', eyebrow: 'Our people', heading: H('People who take', 'personal responsibility'),
        lead: 'Professional security teams and chauffeurs, accountable for every engagement.', items: [
          tt('point', 'Professionalism', 'A responsible approach, impeccable presentation and ongoing training.'),
          tt('point', 'Experience', 'Personnel experienced in security services and VIP client care.'),
          tt('point', 'Absolute confidentiality', 'Confidentiality regarding your identity, schedule and movements.'),
        ] },
      { _type: 'clientsBlock', eyebrow: 'Clients', heading: H('Relationships', 'built on trust'),
        lead: 'We serve businesses, public organisations, retail premises, industrial facilities and discerning private clients.',
        body: 'Absolute confidentiality is a core commitment. Every engagement, and every piece of information, is treated with discretion and respect for our clients’ privacy.',
        image: img('chauffeur-hotel.jpg', 'Chauffeur waiting at a hotel entrance'), primary: L('Contact us', 'contact'), secondary: L('Book a transfer', 'book') },
    ],
  };

  const contact = {
    slug: 'contact', kind: 'standard', title: 'Contact',
    seoTitle: 'Contact Elite Protection: 24/7 office in Athens',
    seoDescription: 'Call our office any time, or send us a message. Everything you tell us is treated in confidence.',
    sections: [
      { _type: 'pageHero', layout: 'page', eyebrow: 'Contact', heading: H('Your service', 'starts here.'), badge: '24/7', image: img('brand-facets.jpg', 'Gold facets, Elite Protection brand texture') },
      { _type: 'contactCards', callLabel: 'Call · 24/7', emailLabel: 'Email', emailNote: 'We reply as soon as possible', officeLabel: 'Office', officeNote: 'To be supplied by Elite Protection' },
      { _type: 'enquiryForm', layout: 'contact', eyebrow: 'Send a message', heading: H('How can we', 'help?'),
        lead: 'Everything you tell us is treated in confidence. For an immediate answer, call us any time.', form: ref('form-contact'),
        mapLabel: 'Map · Athens (placeholder)', asideTitle: 'Already booked?', asideNote: 'Find your booking with its reference and the email you used. We send you a secure link.',
        asideLink: L('Find my booking →', 'findBooking') },
    ],
  };

  const request = {
    slug: 'request-a-transfer', kind: 'standard', title: 'Request a transfer',
    seoTitle: 'Request a transfer quote | Elite Protection',
    seoDescription: 'Send us the details of your journey and our office replies with a confirmed price and availability.',
    sections: [
      { _type: 'pageHero', layout: 'page', eyebrow: 'VIP Transfer / Request a transfer', heading: H('Tell us about', 'your journey.'),
        lead: 'Send us the details and our office replies with a confirmed price and availability. No payment is taken at this stage.',
        image: img('s-class-terminal.jpg', 'S-Class waiting at the airport terminal') },
      { _type: 'enquiryForm', layout: 'request', form: ref('form-transfer-request'), asideTitle: 'How requests work',
        asideSteps: ['Send the details of your journey', 'Our office confirms price and availability', 'Your chauffeur meets you on the day'],
        asideNote: 'Airport transfers from {fromTransfer} (VAT included). Prefer to book and pay now?', asideLink: L('Book online', 'book'), asideBadge: 'Urgent? Call 24/7' },
    ],
  };

  const vehicleTemplate = {
    slug: 'vehicle', kind: 'template', title: 'Vehicle page sections',
    seoTitle: 'Vehicle', seoDescription: 'Sections shown under every vehicle page.',
    sections: [
      { _type: 'onBoard', layout: 'grid', eyebrow: 'On board', heading: H('Every detail', 'of hospitality'), items: [
        tt('amenity', 'Wi-Fi', 'Internet access for work and communication throughout your journey.'),
        tt('amenity', 'Bottled water', 'Thoughtful attention to the details of hospitality.'),
        tt('amenity', 'Device charging', 'Charging for mobile phones and personal devices.'),
        tt('amenity', 'Comfort and care', 'Air conditioning, maintained interiors and help with your luggage.'),
      ] },
      { _type: 'ctaPanel', layout: 'escort', eyebrow: 'VIP Transfer + VIP Security', heading: H('Travel with a', 'security escort'),
        lead: 'Add close protection to any transfer. Vehicle, chauffeur and escort team work to one coordinated plan tailored to you.',
        primary: L('About VIP Security', 'vipSecurity'), secondary: L('Book with escort', 'url', '/book?vip=1') },
    ],
  };

  const legalHub = {
    slug: 'legal', kind: 'standard', title: 'Legal',
    seoTitle: 'Terms, privacy and cookies | Elite Protection', seoDescription: 'Terms and conditions, cancellation and refunds, privacy policy and cookies.',
    sections: [
      { _type: 'pageHero', layout: 'status', eyebrow: 'Legal', heading: H('Terms, privacy', '& cookies'),
        lead: 'Last updated: [date]. Wording in square brackets is supplied and approved by Elite Protection and its legal adviser before launch.',
        image: img('brand-facets.jpg', 'Gold facets, Elite Protection brand texture') },
    ],
  };
  const legalDoc = (slug, title, heading, body) => ({
    slug, kind: 'legal', title, seoTitle: `${title} | Elite Protection`, seoDescription: `${title} of Elite Protection.`,
    sections: [{ _type: 'legalDocument', heading, body }],
  });
  const P = (text) => h.block(text);
  const legal = [
    legalDoc('terms', 'Terms & conditions', H('Terms &', 'conditions'), [
      pb([['All prices are quoted in euros (€) and '], ['include 24% VAT.', true]]),
      pb([['Airport transfer rates apply to '], ['one-way journeys', true], [' between Athens International Airport (AIA) and Athens.']]),
      pb([['Minimum booking hours apply to '], ['hourly chauffeur services.', true]]),
      P('[Further terms of service: waiting time, additional stops, luggage, liability, security services: to be supplied.]'),
    ]),
    legalDoc('cancellation', 'Cancellation & refunds', H('Cancellation', '& refunds'), [
      P('[Cancellation windows and refund amounts: to be supplied.]'),
      P('You can cancel with the secure link in your confirmation email or through Find my booking. Refunds are returned to the original payment method.'),
    ]),
    legalDoc('privacy', 'Privacy policy', H('Privacy', 'policy'), [
      P('Absolute confidentiality is a core commitment. We treat every engagement and every piece of information with discretion and respect for our clients’ privacy.'),
      P('Who we are', 'h3'), P('[Legal entity name, registered address and data controller contact: to be supplied.]'),
      P('What we collect and why', 'h3'), P('Details you give us in a booking, request or enquiry (name, email, phone, journey details, optional invoice details), used to provide and confirm your service. [Full list and legal bases: to be supplied.]'),
      P('Who processes it', 'h3'), P('[Payment provider, email provider and hosting providers: names and locations to be confirmed.]'),
      P('How long we keep it', 'h3'), P('[Retention period for booking data: to be supplied.]'),
      P('Your rights', 'h3'), P('You may ask to access, correct or delete your data by writing to info@eliteprotection.gr. [Process and response time: to be supplied.]'),
    ]),
    legalDoc('cookies', 'Cookies', H('Cookies'), [
      P('[Cookies and similar technologies used, their purpose and how to change your choice: to be supplied once the final tools are confirmed.]'),
    ]),
  ];

  return [home, fleet, services, vip, about, contact, request, vehicleTemplate, legalHub, ...legal];
}

/** Which design file each seeded page reproduces (used by the fidelity tests and prompts). */
export const V2_PAGE_DESIGN = {
  home: '01-home', fleet: '02-fleet', 'fleet/<key>': '03-vehicle', services: '04-services', 'vip-security': '05-vip-security',
  about: '06-about', contact: '07-contact', 'request-a-transfer': '12-request-transfer', legal: '17-legal',
};

/** uiStrings keys whose default value changed to the V2 design copy (the import can update them with --use-design-copy). */
export const V2_UPDATED_UI_KEYS = [
  'booking.search.title', 'booking.pickup.zone', 'booking.dropoff.zone', 'booking.pickup.address', 'booking.dropoff.address', 'booking.luggage',
  'booking.search.submit', 'booking.details.name', 'booking.details.phone', 'booking.details.notes', 'booking.invoice.toggle', 'booking.invoice.vat',
  'booking.invoice.taxOffice', 'booking.extras.vip', 'booking.extras.vip.hint', 'booking.pay', 'booking.handoff.title', 'booking.handoff.body',
  'booking.confirmed.title', 'booking.confirmed.body', 'booking.notCompleted.title', 'booking.notCompleted.body', 'booking.cancel.title',
  'booking.cancel.confirm', 'lookup.title', 'nav.vipSecurity', 'nav.book', 'manage.timeline.booked', 'manage.timeline.confirmed',
  'form.phone', 'form.vehicleClass', 'form.vipSecurity', 'form.invoice', 'form.pickupAddress', 'form.dropoffAddress', 'form.luggage',
  'form.fromZone', 'form.toZone', 'form.topic', 'form.serviceType',
];
