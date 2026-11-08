export declare const GREECE: { minLat: number; maxLat: number; minLng: number; maxLng: number };
export declare const DEFAULT_BIAS: { lat: number; lng: number; radiusM: number };
export declare const PREFERRED_PLACE_TYPES: string[];
export declare const MIN_INPUT: number;
export declare const MAX_INPUT: number;
export declare const MAX_SUGGESTIONS: number;
export type PlacesErrorCode = 'invalid_request' | 'places_unavailable' | 'outside_area';
export declare class PlacesError extends Error {
  code: PlacesErrorCode;
  constructor(code: PlacesErrorCode, message?: string);
}
export declare class RouteUnavailable extends Error {
  code: 'route_unavailable';
  /** `no_route`: Google answered but found no road route. `routing_failed`: timeout, 5xx, quota. */
  reason: 'no_route' | 'routing_failed';
  constructor(message?: string, reason?: 'no_route' | 'routing_failed');
}
export interface Suggestion {
  placeId: string;
  label: string;
  main: string;
  secondary: string;
}
export interface Place {
  placeId: string;
  lat: number;
  lng: number;
}
export interface PlaceDetails extends Place {
  address: string;
}
export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  source: 'google';
}
export type Bias = { lat: number; lng: number; radiusM: number };
export type LatLng = { lat: number; lng: number };
export type Rectangle = {
  low: { latitude: number; longitude: number };
  high: { latitude: number; longitude: number };
};
export type RouteDbCache = {
  get: (key: string) => Promise<RouteResult | null>;
  set: (key: string, value: RouteResult, ttlSeconds: number) => Promise<void>;
};
export declare function isValidSessionToken(t: unknown): boolean;
export declare function isValidPlaceId(id: unknown): boolean;
export declare function inGreece(lat: number, lng: number): boolean;
export declare function cleanInput(input: unknown): string | null;
export declare function autocomplete(o: {
  input: string;
  sessionToken: string;
  apiKey: string;
  language?: string;
  bias?: Bias;
  locationRestriction?: Rectangle;
  preferPrimaryTypes?: string[];
  fetch?: typeof fetch;
}): Promise<Suggestion[]>;
export declare function placeDetails(o: {
  placeId: string;
  sessionToken: string;
  apiKey: string;
  language?: string;
  fetch?: typeof fetch;
}): Promise<PlaceDetails>;
export declare function parsePlace(value: unknown): Place | null;
export declare function placeColumns(
  prefix: 'pickup' | 'dropoff',
  place: Place | null,
): Record<string, string | number | null>;
export declare function mapsDirectionsUrl(o: {
  address?: string;
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string;
export declare function addressAnswer(address: string, place: Place | null): string;
export declare function roundCoord(n: number): number;
export declare function roundDepartAt(departAt: string | Date | null | undefined): string;
export declare function routeCacheKey(
  origin: LatLng,
  destination: LatLng,
  stops?: LatLng[],
  departAt?: string | Date | null,
): string;
export declare function __resetRouteCacheForTests(): void;
export declare function route(o: {
  origin: LatLng;
  destination: LatLng;
  stops?: LatLng[];
  departAt?: string | Date | null;
  apiKey: string;
  fetch?: typeof fetch;
  dbCache?: RouteDbCache;
}): Promise<RouteResult>;
