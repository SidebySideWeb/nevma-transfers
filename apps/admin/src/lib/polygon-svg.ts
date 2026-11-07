/** Tiny static SVG outline from GeoJSON polygon coordinates [[lng,lat],...]. No map API. */
export function polygonToSvg(
  polygon: { type?: string; coordinates?: number[][][] } | null | undefined,
  size = 96,
): string {
  const ring = polygon?.coordinates?.[0];
  if (!ring?.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><rect width="100%" height="100%" fill="#1a1d1f" stroke="#CFA45F"/></svg>`;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pt of ring) {
    const lng = pt[0];
    const lat = pt[1];
    if (lng == null || lat == null) continue;
    minX = Math.min(minX, lng);
    maxX = Math.max(maxX, lng);
    minY = Math.min(minY, lat);
    maxY = Math.max(maxY, lat);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><rect width="100%" height="100%" fill="#1a1d1f" stroke="#CFA45F"/></svg>`;
  }
  const pad = 0.08;
  const w = Math.max(maxX - minX, 1e-6);
  const h = Math.max(maxY - minY, 1e-6);
  const pts = ring
    .map((pt) => {
      const lng = pt[0];
      const lat = pt[1];
      if (lng == null || lat == null) return null;
      const x = ((lng - minX) / w) * (1 - 2 * pad) * size + pad * size;
      const y = (1 - (lat - minY) / h) * (1 - 2 * pad) * size + pad * size;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter((p): p is string => p != null)
    .join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Area outline"><rect width="100%" height="100%" fill="#15181A"/><polygon points="${pts}" fill="rgba(207,164,95,.25)" stroke="#CFA45F" stroke-width="1.5"/></svg>`;
}
