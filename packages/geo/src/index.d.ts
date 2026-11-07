export type LatLng = { lat: number; lng: number };

export type AreaRing = [number, number][];

export type AreaDef = { id?: string; ring: AreaRing };

export declare const AREAS: Record<string, AreaDef>;

export declare function pointInRing(lat: number, lng: number, ring: AreaRing): boolean;

export declare function inServiceArea(point: LatLng, area?: string): boolean;

export declare function areaBounds(area?: string): {
  low: { latitude: number; longitude: number };
  high: { latitude: number; longitude: number };
};

export declare function pointArea(
  point: LatLng,
  areas: Record<string, { ring: AreaRing }>,
): string | null;
