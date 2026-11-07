/**
 * Booking-v2 feature switch profiles for B10 QA (`docs/BOOKING-V2-PLAN.md` §2).
 * Shared by `feature-matrix.mjs` and its tests.
 */

/** Stub keys so distance/whatsapp/flight switches can resolve on without calling real providers. */
const STUBS = Object.freeze({
  GOOGLE_MAPS_SERVER_KEY: 'matrix-google-stub',
  QUOTE_SIGNING_SECRET: 'matrix-quote-signing-secret-32b',
  WHATSAPP_NUMBER: '306900000000',
  FLIGHT_PROVIDER: 'manual',
  SERVICE_AREA: 'attica',
});

/** Clear every booking-v2 switch (exact off). */
function allOff() {
  return {
    PRICING_MODE: 'zones',
    FEATURE_DISTANCE_PRICING: 'false',
    FEATURE_DEMAND_PRICING: 'false',
    FEATURE_PLACES: 'false',
    FEATURE_RETURN_TRIP: 'false',
    FEATURE_FLIGHT_TRACKING: 'false',
    FEATURE_CORPORATE: 'false',
    FEATURE_DRIVERS: 'false',
    FEATURE_WHATSAPP: 'false',
    SERVICE_AREA: 'attica',
    FLIGHT_PROVIDER: '',
    FLIGHT_PROVIDER_KEY: '',
    WHATSAPP_NUMBER: '',
    GOOGLE_MAPS_SERVER_KEY: '',
    QUOTE_SIGNING_SECRET: '',
  };
}

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   env: Record<string, string>,
 *   expect: {
 *     pricingMode: string,
 *     distancePricing: boolean,
 *     demandPricing: boolean,
 *     places: boolean,
 *     returnTrip: boolean,
 *     flightTracking: boolean,
 *     corporate: boolean,
 *     drivers: boolean,
 *     whatsapp: boolean,
 *   },
 * }} FeatureProfile
 */

/** @type {FeatureProfile[]} */
export const FEATURE_PROFILES = [
  {
    id: 'legacy',
    label: 'Everything off, PRICING_MODE=zones (pre–booking-v2 behaviour)',
    env: allOff(),
    expect: {
      pricingMode: 'zones',
      distancePricing: false,
      demandPricing: false,
      places: false,
      returnTrip: false,
      flightTracking: false,
      corporate: false,
      drivers: false,
      whatsapp: false,
    },
  },
  {
    id: 'elite-whatsapp',
    label: 'Legacy + WhatsApp (Elite contact)',
    env: {
      ...allOff(),
      FEATURE_WHATSAPP: 'true',
      WHATSAPP_NUMBER: STUBS.WHATSAPP_NUMBER,
    },
    expect: {
      pricingMode: 'zones',
      distancePricing: false,
      demandPricing: false,
      places: false,
      returnTrip: false,
      flightTracking: false,
      corporate: false,
      drivers: false,
      whatsapp: true,
    },
  },
  {
    id: 'hybrid-core',
    label: 'Distance hybrid + places + WhatsApp',
    env: {
      ...allOff(),
      PRICING_MODE: 'hybrid',
      FEATURE_DISTANCE_PRICING: 'true',
      FEATURE_PLACES: 'true',
      FEATURE_WHATSAPP: 'true',
      GOOGLE_MAPS_SERVER_KEY: STUBS.GOOGLE_MAPS_SERVER_KEY,
      QUOTE_SIGNING_SECRET: STUBS.QUOTE_SIGNING_SECRET,
      WHATSAPP_NUMBER: STUBS.WHATSAPP_NUMBER,
    },
    expect: {
      pricingMode: 'hybrid',
      distancePricing: true,
      demandPricing: false,
      places: true,
      returnTrip: false,
      flightTracking: false,
      corporate: false,
      drivers: false,
      whatsapp: true,
    },
  },
  {
    id: 'distance-core',
    label: 'Distance mode + places + WhatsApp',
    env: {
      ...allOff(),
      PRICING_MODE: 'distance',
      FEATURE_DISTANCE_PRICING: 'true',
      FEATURE_PLACES: 'true',
      FEATURE_WHATSAPP: 'true',
      GOOGLE_MAPS_SERVER_KEY: STUBS.GOOGLE_MAPS_SERVER_KEY,
      QUOTE_SIGNING_SECRET: STUBS.QUOTE_SIGNING_SECRET,
      WHATSAPP_NUMBER: STUBS.WHATSAPP_NUMBER,
    },
    expect: {
      pricingMode: 'distance',
      distancePricing: true,
      demandPricing: false,
      places: true,
      returnTrip: false,
      flightTracking: false,
      corporate: false,
      drivers: false,
      whatsapp: true,
    },
  },
  {
    id: 'full',
    label: 'Everything on (flight provider = manual)',
    env: {
      ...allOff(),
      PRICING_MODE: 'hybrid',
      FEATURE_DISTANCE_PRICING: 'true',
      FEATURE_DEMAND_PRICING: 'true',
      FEATURE_PLACES: 'true',
      FEATURE_RETURN_TRIP: 'true',
      FEATURE_FLIGHT_TRACKING: 'true',
      FEATURE_CORPORATE: 'true',
      FEATURE_DRIVERS: 'true',
      FEATURE_WHATSAPP: 'true',
      FLIGHT_PROVIDER: 'manual',
      GOOGLE_MAPS_SERVER_KEY: STUBS.GOOGLE_MAPS_SERVER_KEY,
      QUOTE_SIGNING_SECRET: STUBS.QUOTE_SIGNING_SECRET,
      WHATSAPP_NUMBER: STUBS.WHATSAPP_NUMBER,
    },
    expect: {
      pricingMode: 'hybrid',
      distancePricing: true,
      demandPricing: true,
      places: true,
      returnTrip: true,
      flightTracking: true,
      corporate: true,
      drivers: true,
      whatsapp: true,
    },
  },
  {
    // Friend's transfer company: Blacklane-style pricing + drivers + WhatsApp; no VIP corporate/flights.
    id: 'friend',
    label: "Friend's transfer set (hybrid, places, return, drivers, WhatsApp)",
    env: {
      ...allOff(),
      PRICING_MODE: 'hybrid',
      FEATURE_DISTANCE_PRICING: 'true',
      FEATURE_DEMAND_PRICING: 'false',
      FEATURE_PLACES: 'true',
      FEATURE_RETURN_TRIP: 'true',
      FEATURE_FLIGHT_TRACKING: 'false',
      FEATURE_CORPORATE: 'false',
      FEATURE_DRIVERS: 'true',
      FEATURE_WHATSAPP: 'true',
      GOOGLE_MAPS_SERVER_KEY: STUBS.GOOGLE_MAPS_SERVER_KEY,
      QUOTE_SIGNING_SECRET: STUBS.QUOTE_SIGNING_SECRET,
      WHATSAPP_NUMBER: STUBS.WHATSAPP_NUMBER,
    },
    expect: {
      pricingMode: 'hybrid',
      distancePricing: true,
      demandPricing: false,
      places: true,
      returnTrip: true,
      flightTracking: false,
      corporate: false,
      drivers: true,
      whatsapp: true,
    },
  },
];

/** Admin nav item ids that must remain when every booking-v2 switch is off (pre-B1 contract). */
export const LEGACY_ADMIN_NAV_ITEM_IDS = Object.freeze([
  'today',
  'bookings',
  'calendar',
  'customers',
  'blocked-slots',
  'prices',
  'hourly-rates',
  'extras',
  'fleet',
  'zones',
  'settings',
]);

/** Nav ids that must NOT appear when the matching switch is off. */
export const V2_NAV_WHEN_OFF = Object.freeze([
  'companies',
  'drivers',
  'reports',
  'pricing-rates',
  'pricing-simulator',
  'pricing-flights',
  'pricing-demand',
]);

export { STUBS, allOff };
