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
  schedDep?: string | null;
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

export type FlightCheckPoint = { at: Date; kind: string };

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

export function planFlightChecks(input: {
  bookedAt?: Date | string | null;
  schedArr?: Date | string | null;
  schedDep?: Date | string | null;
  eta?: Date | string | null;
  status?: string | null;
  includeBookingCheck?: boolean;
}): FlightCheckPoint[];

export function computeNextFlightCheckAt(input: {
  bookedAt?: Date | string | null;
  schedArr?: Date | string | null;
  schedDep?: Date | string | null;
  eta?: Date | string | null;
  status?: string | null;
  after?: Date | string | null;
  lastCheckedAt?: Date | string | null;
  force?: boolean;
  includeBookingCheck?: boolean;
}): Date | null;

export function shouldPollFlight(input: {
  flightStatus?: string | null;
  nextFlightCheckAt?: Date | string | null;
  schedArr?: Date | string | null;
  schedDep?: Date | string | null;
  eta?: Date | string | null;
  arrivalAt?: Date | string | null;
  lastCheckedAt?: Date | string | null;
  bookedAt?: Date | string | null;
  now?: Date;
  force?: boolean;
}): { poll: boolean; reason?: string; intervalMin?: number; nextAt?: string };

export function etaMovedEnough(
  prevEta: string | Date | null | undefined,
  nextEta: string | Date | null | undefined,
  thresholdMin?: number,
): boolean;
