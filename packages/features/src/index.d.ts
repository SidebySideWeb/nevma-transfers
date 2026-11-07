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
  feature?: keyof Features;
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
