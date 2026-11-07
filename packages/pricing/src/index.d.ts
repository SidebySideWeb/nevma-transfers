export type BreakdownLine = { code: string; label: string; amount: number };

export type ClassPrice = {
  total: number;
  net: number;
  vat: number;
  breakdown: BreakdownLine[];
  available: boolean;
  reason?: string;
  kmIncluded?: number;
};

export type ClassRate = {
  base_fare: number;
  per_km: number;
  per_min: number;
  minimum_fare: number;
  km_per_hour?: number;
  extra_km_rate?: number;
};

export type PricingSettings = {
  night: { from: string; to: string; factor: number };
  stop_fee: number;
  waiting?: {
    airport_free_min: number;
    other_free_min: number;
    per_min: number;
  };
  rounding: 1 | 5;
  return_discount_pct?: number;
  quote_ttl_min?: number;
  demand?: {
    enabled: boolean;
    steps: Array<{ over: number; factor: number }>;
    max: number;
  };
};

export type PriceTripInput = {
  trip: {
    type: 'transfer' | 'hourly';
    pickupAt: string | Date;
    distanceKm?: number | null;
    durationMin: number;
    hours?: number | null;
    stops?: unknown[];
    pickup?: { lat: number; lng: number } | null;
    dropoff?: { lat: number; lng: number } | null;
  };
  classes: Array<{
    key: string;
    hourlyRateCents?: number | null;
    minHours?: number | null;
    maxHours?: number | null;
  }>;
  rates: Record<string, ClassRate>;
  settings: PricingSettings;
  periods?: Array<{
    label?: string;
    starts_on: string;
    ends_on: string;
    factor: number;
    active?: boolean;
  }>;
  areas?: Array<{
    label: string;
    kind: string;
    polygon: unknown;
    fee: number;
    active?: boolean;
  }>;
  zonePrice?: (classKey: string) => number | null | undefined;
  mode?: 'zones' | 'distance' | 'hybrid';
  demand?: number;
  extras?: BreakdownLine[];
  vatRateBp?: number;
};

export declare function splitVat(
  grossCents: number,
  vatRateBp: number,
): { net: number; vat: number };
export declare function roundUpEuros(cents: number, rounding: 1 | 5 | number): number;
export declare function athensMinutesOfDay(isoOrDate: string | Date): number;
export declare function parseHm(hm: string): number;
export declare function applyReturnDiscount(cents: number, pct: number | undefined | null): number;
export declare function inNightWindow(
  pickupAt: string | Date,
  night: { from: string; to: string; factor?: number },
): boolean;
export declare function periodFactor(
  pickupAt: string | Date,
  periods: Array<{
    starts_on: string;
    ends_on: string;
    factor: number;
    active?: boolean;
  }>,
): number;
export declare function areaFees(
  points: Array<{ lat: number; lng: number } | null | undefined>,
  areas: Array<{
    label: string;
    kind: string;
    polygon: unknown;
    fee: number;
    active?: boolean;
  }>,
): { total: number; lines: BreakdownLine[] };
export declare function priceTrip(input: PriceTripInput): {
  perClass: Record<string, ClassPrice>;
};
