/** Digits only, Greek national number without country code when possible. */
function nationalDigits(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('0030')) d = d.slice(4);
  else if (d.startsWith('30') && d.length >= 12) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}

/** Display as +30 694 733 3086; adds +30 when missing. */
export function formatPhone(raw: string | null | undefined): string | null {
  if (raw == null || !raw.trim()) return null;
  const d = nationalDigits(raw);
  if (!d) return null;
  if (d.length === 10) {
    return `+30 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  }
  return `+30 ${d}`;
}

export function phoneTelHref(raw: string | null | undefined): string | null {
  if (raw == null || !raw.trim()) return null;
  const d = nationalDigits(raw);
  if (!d) return null;
  return `tel:+30${d}`;
}
