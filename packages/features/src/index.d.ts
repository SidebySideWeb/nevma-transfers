export type PricingMode = 'zones' | 'distance' | 'hybrid';

export interface Features {
  pricingMode: PricingMode;
  distancePricing: boolean;
  demandPricing: boolean;
  places: boolean;
  returnTrip: boolean;
  flightTracking: boolean;
  corporate: boolean;
  drivers: boolean;
  whatsapp: boolean;
  serviceArea: string;
  whatsappNumber: string | null;
  flightProvider: string | null;
}

export type PublicFeatures = Readonly<{
  pricingMode: PricingMode;
  distancePricing: boolean;
  demandPricing: boolean;
  places: boolean;
  returnTrip: boolean;
  flightTracking: boolean;
  corporate: boolean;
  drivers: boolean;
  whatsapp: boolean;
  whatsappNumber: string | null;
}>;

export declare function isOn(value: unknown): boolean;
export declare function features(
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
  log?: { warn?: (msg: string) => void; error?: (msg: string) => void },
): Readonly<Features>;
export declare function publicFeatures(f: Features): PublicFeatures;
export declare function notFoundUnless(flag: boolean): Response | null;

export type AdminNavItem = {
  href: string;
  id: string;
  label: string;
  /** Show only when this switch is on. */
  feature?: keyof Features;
  /** Show only when every listed switch is on. */
  features?: readonly (keyof Features)[];
  /** Hide when this switch is on (legacy Pricing items). */
  hideWhen?: keyof Features;
  count?: number;
};
export type AdminNavGroup = {
  id: string;
  label: string;
  feature?: keyof Features;
  items: AdminNavItem[];
};

export declare const ADMIN_NAV: readonly AdminNavGroup[];
export declare function filterAdminNav(
  f: Features,
  groups?: readonly AdminNavGroup[],
): AdminNavGroup[];

/** International digits for wa.me, or null if invalid. Greek national → 30…. */
export declare function whatsappDigits(raw: string | null | undefined): string | null;
/** "23 Nov, 18:34" in Europe/Athens, or null. */
export declare function formatWhatsappPickup(
  pickupAt: string | Date | null | undefined,
): string | null;
/**
 * Free WhatsApp click-to-chat URL. Returns null when the number is missing/invalid.
 * Prefill never includes name, address, phone or price (`name` is ignored).
 */
export declare function whatsappUrl(opts?: {
  number?: string | null;
  ref?: string | null;
  pickupAt?: string | Date | null;
  text?: string | null;
  name?: string | null;
}): string | null;
