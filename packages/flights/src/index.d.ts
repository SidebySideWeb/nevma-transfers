export type FlightStatus =
  | 'scheduled'
  | 'delayed'
  | 'landed'
  | 'cancelled'
  | 'diverted'
  | 'unknown';

export type FlightLookup = {
  found: boolean;
  airline?: string | null;
  origin?: string | null;
  originCountry?: string | null;
  schedArr?: string | null;
  eta?: string | null;
  status?: FlightStatus | string;
  terminal?: string | null;
  raw?: unknown;
};

export type LookupInput = { number: string; date: string };

export type FlightProvider = {
  name: string;
  lookup(input: LookupInput): Promise<FlightLookup>;
};

export function normalizeFlightNumber(raw: string | null | undefined): string;
export function compactFlightNumber(raw: string | null | undefined): string;

export function parseAerodatabox(body: unknown): FlightLookup;
export function parseFlightaware(body: unknown, dateYmd?: string): FlightLookup;
export function parseManual(): FlightLookup;

export function createAerodataboxAdapter(opts?: {
  apiKey?: string;
  fetchImpl?: (url: string, headers: Record<string, string>) => Promise<unknown>;
}): FlightProvider;
export function createFlightawareAdapter(opts?: {
  apiKey?: string;
  fetchImpl?: (url: string, headers: Record<string, string>) => Promise<unknown>;
}): FlightProvider;
export function createManualAdapter(): FlightProvider;
export function createFlightProvider(opts?: {
  provider?: string;
  apiKey?: string;
  fetchImpl?: (url: string, headers: Record<string, string>) => Promise<unknown>;
}): FlightProvider;

export function pickupBufferMin(
  originCountry: string | null | undefined,
  buffers?: { domestic?: number; international?: number },
): number;
export function suggestedPickupAt(arrivalIso: string | Date, bufferMin: number): Date | null;
export function shouldPollFlight(input: {
  flightStatus?: string | null;
  arrivalAt: Date | string | null;
  lastCheckedAt?: Date | string | null;
  now?: Date;
}): { poll: boolean; reason?: string; intervalMin?: number };
export function etaMovedEnough(
  prevEta: string | Date | null | undefined,
  nextEta: string | Date | null | undefined,
  thresholdMin?: number,
): boolean;
