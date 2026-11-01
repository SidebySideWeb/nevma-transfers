import type { CmsPage } from './pages';

/** Offline DEMO pages when Sanity env is not configured (local e2e / smoke). */
export const DEMO_PAGES: Record<string, CmsPage> = {
  home: {
    kind: 'home',
    title: 'Home',
    slug: 'home',
    seo: {
      title: 'TEM Protection (DEMO)',
      description: 'DEMO home description.',
    },
    sections: [
      {
        _type: 'hero',
        heading: 'DEMO Arrive on time. Travel protected.',
        subheading:
          'DEMO Premium transfers and hourly chauffeur service in Athens, with optional VIP security.',
        ctaLabel: 'Book now',
        ctaTarget: 'book',
      },
      {
        _type: 'richText',
        heading: 'DEMO Why TEM Protection',
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            markDefs: [],
            children: [
              {
                _type: 'span',
                _key: 's1',
                text: 'DEMO paragraph about the service promise. Replace with the client\'s copy.',
                marks: [],
              },
            ],
          },
        ],
      },
      {
        _type: 'faq',
        heading: 'DEMO Questions',
        items: [
          {
            question: 'DEMO How is the price set?',
            answer: 'DEMO Fixed prices per area and vehicle, shown before you pay.',
          },
          {
            question: 'DEMO Can I cancel?',
            answer:
              'DEMO Yes, from the link in your confirmation email, within the cancellation window.',
          },
        ],
      },
      {
        _type: 'ctaBand',
        heading: 'DEMO Ready to book?',
        text: 'DEMO Choose your trip and pay securely online.',
        ctaLabel: 'Book now',
        ctaTarget: 'book',
      },
    ],
  },
  privacy: {
    kind: 'legal',
    title: 'Privacy policy',
    slug: 'privacy',
    seo: { title: 'Privacy policy (DEMO)' },
    sections: [
      {
        _type: 'richText',
        heading: 'Privacy policy',
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            markDefs: [],
            children: [
              {
                _type: 'span',
                _key: 's1',
                text: 'DEMO privacy policy text. The client supplies the final legal text.',
                marks: [],
              },
            ],
          },
        ],
      },
    ],
  },
  cookies: {
    kind: 'legal',
    title: 'Cookie policy',
    slug: 'cookies',
    seo: { title: 'Cookie policy (DEMO)' },
    sections: [
      {
        _type: 'richText',
        heading: 'Cookie policy',
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            markDefs: [],
            children: [
              {
                _type: 'span',
                _key: 's1',
                text: 'DEMO cookie policy text. The client supplies the final legal text.',
                marks: [],
              },
            ],
          },
        ],
      },
    ],
  },
  terms: {
    kind: 'legal',
    title: 'Terms of service',
    slug: 'terms',
    seo: { title: 'Terms of service (DEMO)' },
    sections: [
      {
        _type: 'richText',
        heading: 'Terms of service',
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            markDefs: [],
            children: [
              {
                _type: 'span',
                _key: 's1',
                text: 'DEMO terms of service text. The client supplies the final legal text.',
                marks: [],
              },
            ],
          },
        ],
      },
    ],
  },
  cancellation: {
    kind: 'legal',
    title: 'Cancellation and refunds',
    slug: 'cancellation',
    seo: { title: 'Cancellation and refunds (DEMO)' },
    sections: [
      {
        _type: 'richText',
        heading: 'Cancellation and refunds',
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            markDefs: [],
            children: [
              {
                _type: 'span',
                _key: 's1',
                text: 'DEMO cancellation and refunds text. The client supplies the final legal text.',
                marks: [],
              },
            ],
          },
        ],
      },
    ],
  },
  fleet: {
    kind: 'standard',
    title: 'Fleet',
    slug: 'fleet',
    seo: { title: 'Fleet (DEMO)', description: 'DEMO fleet description.' },
    sections: [
      {
        _type: 'hero',
        heading: 'DEMO Our fleet',
        subheading: 'DEMO Late-model vehicles with professional drivers.',
        ctaLabel: 'Book now',
        ctaTarget: 'book',
      },
      {
        _type: 'vehicleClassList',
        heading: 'DEMO Choose your vehicle',
      },
      {
        _type: 'ctaBand',
        heading: 'DEMO Need something else?',
        text: 'DEMO Groups and special requests.',
        ctaLabel: 'Request a quote',
        ctaTarget: 'quote',
      },
    ],
  },
  services: {
    kind: 'standard',
    title: 'Services',
    slug: 'services',
    seo: { title: 'Services (DEMO)', description: 'DEMO services description.' },
    sections: [
      {
        _type: 'hero',
        heading: 'DEMO Our services',
        subheading: 'DEMO Transfers, hourly hire and VIP security.',
        ctaLabel: 'Book now',
        ctaTarget: 'book',
      },
      {
        _type: 'featureGrid',
        heading: 'DEMO What we do',
        items: [
          {
            title: 'DEMO Airport transfers',
            text: 'DEMO Fixed prices to and from the airport.',
            link: '/routes/athens-airport-to-piraeus-port',
          },
          {
            title: 'DEMO By the hour',
            text: 'DEMO A vehicle and driver for as long as you need.',
            link: '/book?type=hourly',
          },
          {
            title: 'DEMO VIP security',
            text: 'DEMO Add protection to any booking.',
            link: '/vip-security',
          },
        ],
      },
      {
        _type: 'steps',
        heading: 'DEMO How it works',
        items: [
          { title: 'DEMO Choose your trip', text: 'DEMO Areas, date and time.' },
          { title: 'DEMO Pick a vehicle', text: 'DEMO Fixed price shown before you pay.' },
          { title: 'DEMO Pay securely', text: 'DEMO Confirmation by email.' },
        ],
      },
      {
        _type: 'routeList',
        heading: 'DEMO Popular routes',
      },
    ],
  },
  'vip-security': {
    kind: 'standard',
    title: 'VIP security',
    slug: 'vip-security',
    seo: { title: 'VIP security (DEMO)', description: 'DEMO VIP security description.' },
    sections: [
      {
        _type: 'hero',
        heading: 'DEMO Close protection, quietly done.',
        subheading: 'DEMO Protection for people, premises and property.',
        ctaLabel: 'Send an enquiry',
        ctaTarget: 'url',
        ctaUrl: '#enquiry',
      },
      {
        _type: 'imageText',
        heading: 'DEMO What is included',
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            markDefs: [],
            children: [
              {
                _type: 'span',
                _key: 's1',
                text: 'DEMO inclusions and legal wording from the client.',
                marks: [],
              },
            ],
          },
        ],
        imageSide: 'right',
      },
      {
        _type: 'formBlock',
        form: {
          key: 'vip-security',
          title: 'DEMO VIP security enquiry',
          intro: 'DEMO form intro.',
        },
      },
      {
        _type: 'contactDetails',
        heading: 'DEMO Security desk',
        showHours: true,
      },
    ],
  },
  about: {
    kind: 'standard',
    title: 'About',
    slug: 'about',
    seo: { title: 'About (DEMO)', description: 'DEMO about description.' },
    sections: [
      {
        _type: 'imageText',
        heading: 'DEMO Two divisions, one company.',
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            markDefs: [],
            children: [
              {
                _type: 'span',
                _key: 's1',
                text: 'DEMO About Elite Protection in Athens.',
                marks: [],
              },
            ],
          },
        ],
        imageSide: 'left',
      },
      {
        _type: 'ctaBand',
        heading: 'DEMO Travel with us',
        ctaLabel: 'Book now',
        ctaTarget: 'book',
      },
    ],
  },
  contact: {
    kind: 'standard',
    title: 'Contact',
    slug: 'contact',
    seo: { title: 'Contact (DEMO)', description: 'DEMO contact description.' },
    sections: [
      {
        _type: 'contactDetails',
        heading: 'DEMO Get in touch',
        showHours: true,
      },
      {
        _type: 'formBlock',
        form: { key: 'contact', title: 'DEMO Contact us', intro: 'DEMO contact form intro.' },
      },
    ],
  },
  'request-a-transfer': {
    kind: 'standard',
    title: 'Request a transfer',
    slug: 'request-a-transfer',
    seo: {
      title: 'Request a transfer (DEMO)',
      description: 'DEMO request a transfer description.',
    },
    sections: [
      {
        _type: 'richText',
        heading: 'DEMO Request a quote',
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            markDefs: [],
            children: [
              {
                _type: 'span',
                _key: 's1',
                text: 'DEMO For trips we cannot price online.',
                marks: [],
              },
            ],
          },
        ],
      },
      {
        _type: 'formBlock',
        form: {
          key: 'transfer-request',
          title: 'DEMO Transfer request',
          intro: 'DEMO request form intro.',
        },
      },
    ],
  },
};
