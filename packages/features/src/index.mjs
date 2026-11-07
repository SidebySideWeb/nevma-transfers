/** @tem/features — server-side feature switches (docs/FEATURES.md, docs/BOOKING-V2-PLAN.md §2). */

const WHATSAPP_NUMBER_RE = /^[1-9]\d{7,14}$/;
const PRICING_MODES = new Set(['zones', 'distance', 'hybrid']);
const FLIGHT_PROVIDERS = new Set(['aerodatabox', 'flightaware', 'manual']);

/** Exact string `"true"` only. Anything else (incl. `"TRUE"`, `"1"`, `"yes"`) is off. */
export function isOn(value) {
  return value === 'true';
}

/**
 * @typedef {'zones'|'distance'|'hybrid'} PricingMode
 * @typedef {{
 *   pricingMode: PricingMode,
 *   distancePricing: boolean,
 *   demandPricing: boolean,
 *   places: boolean,
 *   returnTrip: boolean,
 *   flightTracking: boolean,
 *   corporate: boolean,
 *   drivers: boolean,
 *   whatsapp: boolean,
 *   serviceArea: string,
 *   whatsappNumber: string|null,
 *   flightProvider: string|null,
 * }} Features
 */

/**
 * Resolve switches from an env-like object. Dependency failures log one error and force the switch off.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{ warn?: (msg: string) => void, error?: (msg: string) => void }} [log]
 * @returns {Readonly<Features>}
 */
export function features(env = process.env, log = console) {
  const warn = typeof log.warn === 'function' ? log.warn.bind(log) : console.warn;
  const error = typeof log.error === 'function' ? log.error.bind(log) : console.error;

  let pricingMode = env.PRICING_MODE || 'zones';
  if (!PRICING_MODES.has(pricingMode)) {
    warn(`PRICING_MODE="${pricingMode}" is unknown; using "zones".`);
    pricingMode = 'zones';
  }

  let distancePricing = isOn(env.FEATURE_DISTANCE_PRICING);
  if (distancePricing) {
    if (!env.GOOGLE_MAPS_SERVER_KEY || !env.QUOTE_SIGNING_SECRET) {
      error(
        'FEATURE_DISTANCE_PRICING=true needs GOOGLE_MAPS_SERVER_KEY and QUOTE_SIGNING_SECRET; distance pricing stays off.',
      );
      distancePricing = false;
    }
  }

  if ((pricingMode === 'distance' || pricingMode === 'hybrid') && !distancePricing) {
    error(
      `PRICING_MODE=${pricingMode} needs FEATURE_DISTANCE_PRICING (with its keys); falling back to "zones".`,
    );
    pricingMode = 'zones';
  }

  let demandPricing = isOn(env.FEATURE_DEMAND_PRICING);
  if (demandPricing && !distancePricing) {
    error('FEATURE_DEMAND_PRICING=true needs distance pricing; demand pricing stays off.');
    demandPricing = false;
  }

  const places = isOn(env.FEATURE_PLACES);
  const returnTrip = isOn(env.FEATURE_RETURN_TRIP);
  const corporate = isOn(env.FEATURE_CORPORATE);
  const drivers = isOn(env.FEATURE_DRIVERS);

  let flightTracking = isOn(env.FEATURE_FLIGHT_TRACKING);
  let flightProvider = null;
  if (flightTracking) {
    const provider = (env.FLIGHT_PROVIDER || '').trim().toLowerCase();
    if (!FLIGHT_PROVIDERS.has(provider)) {
      error(
        'FEATURE_FLIGHT_TRACKING=true needs FLIGHT_PROVIDER=aerodatabox|flightaware|manual; flight tracking stays off.',
      );
      flightTracking = false;
    } else if (provider !== 'manual' && !env.FLIGHT_PROVIDER_KEY) {
      error(
        `FEATURE_FLIGHT_TRACKING=true with FLIGHT_PROVIDER=${provider} needs FLIGHT_PROVIDER_KEY; flight tracking stays off.`,
      );
      flightTracking = false;
    } else {
      flightProvider = provider;
    }
  }

  let whatsapp = isOn(env.FEATURE_WHATSAPP);
  let whatsappNumber = null;
  if (whatsapp) {
    const n = (env.WHATSAPP_NUMBER || '').trim();
    if (!WHATSAPP_NUMBER_RE.test(n)) {
      error(
        'FEATURE_WHATSAPP=true needs WHATSAPP_NUMBER as international digits (^[1-9]\\d{7,14}$); WhatsApp stays off.',
      );
      whatsapp = false;
    } else {
      whatsappNumber = n;
    }
  }

  const serviceArea = (env.SERVICE_AREA || 'attica').trim() || 'attica';

  return Object.freeze({
    pricingMode,
    distancePricing,
    demandPricing,
    places,
    returnTrip,
    flightTracking,
    corporate,
    drivers,
    whatsapp,
    serviceArea,
    whatsappNumber,
    flightProvider,
  });
}

/**
 * Browser-safe subset. Never secrets or API keys.
 * @param {Features} f
 */
export function publicFeatures(f) {
  return Object.freeze({
    pricingMode: f.pricingMode,
    distancePricing: f.distancePricing,
    demandPricing: f.demandPricing,
    places: f.places,
    returnTrip: f.returnTrip,
    flightTracking: f.flightTracking,
    corporate: f.corporate,
    drivers: f.drivers,
    whatsapp: f.whatsapp,
    whatsappNumber: f.whatsappNumber,
  });
}

/** 404 Response when the flag is off; null when on (Astro routes / API endpoints). */
export function notFoundUnless(flag) {
  if (flag) return null;
  return new Response(null, { status: 404, statusText: 'Not Found' });
}

/**
 * @typedef {{ href: string, id: string, label: string, feature?: keyof Features, count?: number }} AdminNavItem
 * @typedef {{ id: string, label: string, feature?: keyof Features, items: AdminNavItem[] }} AdminNavGroup
 */

/** Declarative admin sidebar. Items/groups with `feature` hide when that switch is off. */
export const ADMIN_NAV = Object.freeze([
  Object.freeze({
    id: 'operations',
    label: 'Operations',
    items: Object.freeze([
      Object.freeze({ href: '/today', id: 'today', label: 'Today' }),
      Object.freeze({ href: '/bookings', id: 'bookings', label: 'Bookings' }),
      Object.freeze({ href: '/calendar', id: 'calendar', label: 'Fleet calendar' }),
      Object.freeze({ href: '/customers', id: 'customers', label: 'Customers' }),
      Object.freeze({ href: '/blocked-slots', id: 'blocked-slots', label: 'Blocked slots' }),
    ]),
  }),
  Object.freeze({
    id: 'drivers',
    label: 'Drivers',
    feature: 'drivers',
    items: Object.freeze([
      Object.freeze({ href: '/drivers', id: 'drivers', label: 'Drivers', feature: 'drivers' }),
      Object.freeze({ href: '/reports', id: 'reports', label: 'Reports', feature: 'drivers' }),
    ]),
  }),
  Object.freeze({
    id: 'pricing',
    label: 'Pricing',
    items: Object.freeze([
      // Legacy (zones mode)
      Object.freeze({
        href: '/prices',
        id: 'prices',
        label: 'Zone prices',
        hideWhen: 'distancePricing',
      }),
      Object.freeze({
        href: '/hourly-rates',
        id: 'hourly-rates',
        label: 'Hourly rates',
        hideWhen: 'distancePricing',
      }),
      Object.freeze({ href: '/extras', id: 'extras', label: 'Extras' }),
      // Distance / hybrid Pricing area (B5)
      Object.freeze({
        href: '/pricing/rates',
        id: 'pricing-rates',
        label: 'Rates',
        feature: 'distancePricing',
      }),
      Object.freeze({
        href: '/prices',
        id: 'prices',
        label: 'Fixed routes',
        feature: 'distancePricing',
      }),
      Object.freeze({
        href: '/hourly-rates',
        id: 'hourly-rates',
        label: 'Hourly',
        feature: 'distancePricing',
      }),
      Object.freeze({
        href: '/pricing/night',
        id: 'pricing-night',
        label: 'Night & periods',
        feature: 'distancePricing',
      }),
      Object.freeze({
        href: '/pricing/areas',
        id: 'pricing-areas',
        label: 'Airports & ports',
        feature: 'distancePricing',
      }),
      Object.freeze({
        href: '/pricing/waiting',
        id: 'pricing-waiting',
        label: 'Waiting & stops',
        feature: 'distancePricing',
      }),
      Object.freeze({
        href: '/pricing/flights',
        id: 'pricing-flights',
        label: 'Flights',
        feature: 'flightTracking',
      }),
      Object.freeze({
        href: '/pricing/return',
        id: 'pricing-return',
        label: 'Return',
        features: ['distancePricing', 'returnTrip'],
      }),
      Object.freeze({
        href: '/pricing/demand',
        id: 'pricing-demand',
        label: 'Demand',
        features: ['distancePricing', 'demandPricing'],
      }),
      Object.freeze({
        href: '/pricing/simulator',
        id: 'pricing-simulator',
        label: 'Simulator',
        feature: 'distancePricing',
      }),
    ]),
  }),
  Object.freeze({
    id: 'setup',
    label: 'Setup',
    items: Object.freeze([
      Object.freeze({ href: '/fleet', id: 'fleet', label: 'Fleet' }),
      Object.freeze({ href: '/zones', id: 'zones', label: 'Zones' }),
      Object.freeze({ href: '/settings', id: 'settings', label: 'Settings' }),
    ]),
  }),
]);

/**
 * Filter admin nav by resolved features. Drops empty groups.
 * @param {Features} f
 * @param {AdminNavGroup[]} [groups]
 * @returns {AdminNavGroup[]}
 */
function navItemVisible(f, i) {
  if (i.hideWhen && f[i.hideWhen]) return false;
  if (i.feature && !f[i.feature]) return false;
  if (Array.isArray(i.features) && !i.features.every((k) => f[k])) return false;
  return true;
}

export function filterAdminNav(f, groups = ADMIN_NAV) {
  return groups
    .map((g) => {
      if (g.feature && !f[g.feature]) return null;
      const items = g.items.filter((i) => navItemVisible(f, i)).map((i) => ({ ...i }));
      if (!items.length) return null;
      return { id: g.id, label: g.label, items };
    })
    .filter(Boolean);
}
