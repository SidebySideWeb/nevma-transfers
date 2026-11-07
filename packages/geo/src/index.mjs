import { AREAS } from './areas-data.mjs';

/**
 * Ray-casting point-in-polygon. Ring vertices are [lng, lat].
 * Vertices and edges count as inside (inclusive). GeoJSON rings that repeat the
 * first point as the last are fine — zero-length edges are skipped.
 */
export function pointInRing(lat, lng, ring) {
  // Exact vertex → inside
  for (const [x, y] of ring) {
    if (x === lng && y === lat) return true;
  }
  // On an edge → inside
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (pointOnSegment(lng, lat, xi, yi, xj, yj)) return true;
  }
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (xi === xj && yi === yj) continue;
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointOnSegment(px, py, x1, y1, x2, y2) {
  const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  // Closed GeoJSON rings repeat the first vertex; that edge is length 0 and must
  // not count every point as "on the boundary".
  if (len2 === 0) return false;
  const cross = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);
  if (Math.abs(cross) > 1e-12) return false;
  const dot = (px - x1) * (x2 - x1) + (py - y1) * (y2 - y1);
  if (dot < 0) return false;
  return dot <= len2;
}

/**
 * @param {{ lat: number, lng: number }} point
 * @param {string} [area='attica']
 */
export function inServiceArea(point, area = 'attica') {
  const def = AREAS[area];
  if (!def) throw new Error(`Unknown area: ${area}`);
  return pointInRing(point.lat, point.lng, def.ring);
}

/**
 * Bounding box for Places Autocomplete `locationRestriction.rectangle`.
 * @param {string} [area='attica']
 * @returns {{ low: { latitude: number, longitude: number }, high: { latitude: number, longitude: number } }}
 */
export function areaBounds(area = 'attica') {
  const def = AREAS[area];
  if (!def) throw new Error(`Unknown area: ${area}`);
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lng, lat] of def.ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return {
    low: { latitude: minLat, longitude: minLng },
    high: { latitude: maxLat, longitude: maxLng },
  };
}

/**
 * Which named polygon contains this point (first match in `areas` order).
 * Used later for airport / port sub-areas.
 * @param {{ lat: number, lng: number }} point
 * @param {Record<string, { ring: [number, number][] }>} areas
 * @returns {string | null}
 */
export function pointArea(point, areas) {
  for (const [name, def] of Object.entries(areas)) {
    if (pointInRing(point.lat, point.lng, def.ring)) return name;
  }
  return null;
}

export { AREAS };
