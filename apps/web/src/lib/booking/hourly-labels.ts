/** Blacklane-style hourly duration label: "2 hours (80 km included)". */
export function hourlyDurationLabel(hours: number, kmPerHour: number): string {
  const km = Math.round(hours * kmPerHour);
  const unit = hours === 1 ? 'hour' : 'hours';
  return `${hours} ${unit} (${km} km included)`;
}

/** Earliest pick-up local `YYYY-MM-DDTHH:mm` from now + lead minutes, rounded up to 5 min (Athens wall via caller). */
export function earliestPickupLocal(now: Date, minLeadMinutes: number, timeZone: string): string {
  const earliest = new Date(now.getTime() + Math.max(0, minLeadMinutes) * 60_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(earliest);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  let minute = Number(get('minute'));
  let hour = Number(get('hour'));
  let day = Number(get('day'));
  let month = Number(get('month'));
  let year = Number(get('year'));
  const rem = minute % 5;
  if (rem !== 0) minute += 5 - rem;
  if (minute >= 60) {
    minute = 0;
    hour += 1;
  }
  if (hour >= 24) {
    hour = 0;
    // ponytail: bump calendar day via Date in the zone by formatting tomorrow from a +24h instant
    const bump = new Date(earliest.getTime() + 24 * 3600_000);
    const bp = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(bump);
    const g = (t: string) => bp.find((p) => p.type === t)?.value ?? '01';
    year = Number(g('year'));
    month = Number(g('month'));
    day = Number(g('day'));
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

/** True when pickupLocal is at or after earliest (lexicographic works for ISO local). */
export function meetsMinNotice(pickupLocal: string, earliestLocal: string): boolean {
  return Boolean(pickupLocal) && pickupLocal >= earliestLocal;
}

/** Upper-case flight number; keep spaces. */
export function normaliseFlightNumber(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trimStart();
}

export function isAirportZone(zone: { code: string; name: string } | undefined): boolean {
  if (!zone) return false;
  return /airport|aia|lgav/i.test(zone.code) || /airport/i.test(zone.name);
}
