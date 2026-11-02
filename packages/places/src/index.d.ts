export declare const GREECE: { minLat: number; maxLat: number; minLng: number; maxLng: number };
export declare const DEFAULT_BIAS: { lat: number; lng: number; radiusM: number };
export declare const MIN_INPUT: number;
export declare const MAX_INPUT: number;
export declare const MAX_SUGGESTIONS: number;
export type PlacesErrorCode = 'invalid_request' | 'places_unavailable' | 'outside_area';
export declare class PlacesError extends Error { code: PlacesErrorCode; constructor(code: PlacesErrorCode, message?: string); }
export interface Suggestion { placeId: string; label: string; main: string; secondary: string }
export interface Place { placeId: string; lat: number; lng: number }
export interface PlaceDetails extends Place { address: string }
type Bias = { lat: number; lng: number; radiusM: number };
export declare function isValidSessionToken(t: unknown): boolean;
export declare function isValidPlaceId(id: unknown): boolean;
export declare function inGreece(lat: number, lng: number): boolean;
export declare function cleanInput(input: unknown): string | null;
export declare function autocomplete(o: { input: string; sessionToken: string; apiKey: string; language?: string; bias?: Bias; fetch?: typeof fetch }): Promise<Suggestion[]>;
export declare function placeDetails(o: { placeId: string; sessionToken: string; apiKey: string; language?: string; fetch?: typeof fetch }): Promise<PlaceDetails>;
export declare function parsePlace(value: unknown): Place | null;
export declare function placeColumns(prefix: 'pickup' | 'dropoff', place: Place | null): Record<string, string | number | null>;
export declare function mapsDirectionsUrl(o: { address?: string; placeId?: string | null; lat?: number | null; lng?: number | null }): string;
export declare function addressAnswer(address: string, place: Place | null): string;
