/**
 * Normalise flight numbers: "A3603" / "a3 603" / "A3-603" → "A3 603".
 * IATA airline designators are 2 chars (letter+letter or letter+digit); ICAO are 3 letters.
 */
export function normalizeFlightNumber(raw) {
  if (raw == null) return '';
  const s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) return '';
  // ICAO 3-letter + digits (e.g. AEE603) — only when the first three are letters
  const icao = s.match(/^([A-Z]{3})(\d{1,4}[A-Z]?)$/);
  if (icao) return `${icao[1]} ${icao[2]}`;
  // IATA 2-char (AA or A3) + digits (e.g. A3603 → A3 603, LH1284 → LH 1284)
  const iata = s.match(/^([A-Z][A-Z0-9])(\d{1,4}[A-Z]?)$/);
  if (iata) return `${iata[1]} ${iata[2]}`;
  return s;
}

/** Compact form for API paths: "A3 603" → "A3603". */
export function compactFlightNumber(raw) {
  return normalizeFlightNumber(raw).replace(/\s+/g, '');
}
