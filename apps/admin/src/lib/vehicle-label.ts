/**
 * Display vehicle labels consistently as "E-Class #1" (not "E-CLASS #1" / "E-CLASS-1").
 * Storage is unchanged; this is presentation only.
 */
export function displayVehicleLabel(raw: string | null | undefined): string {
  if (raw == null || !raw.trim()) return '—';
  let s = raw.trim();

  s = s.replace(/\b([A-Za-z0-9]+)(?:-([A-Za-z0-9]+))*\b/g, (token) => {
    if (token.toUpperCase() === 'DEMO') return 'DEMO';
    if (/^\d+$/.test(token)) return token;
    return token
      .split('-')
      .map((part) => {
        if (part.length <= 1) return part.toUpperCase();
        if (/^class$/i.test(part)) return 'Class';
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join('-');
  });

  s = s.replace(/[-\s]+#?(\d+)$/, ' #$1');
  return s;
}
