import { describe, expect, it } from 'vitest';
import { buildCalendarIcs, icsEscape } from './booking-manage';

describe('manage calendar ICS (prompt 25)', () => {
  it('AC-36: CRLF, escaped text, UID, DTSTART across a DST date', () => {
    // Europe/Athens still on summer time (UTC+3) on 2026-10-24.
    const pickupAt = new Date('2026-10-24T11:30:00.000+03:00');
    const now = new Date('2026-10-01T12:00:00.000Z');
    const ics = buildCalendarIcs({
      reference: 'EP-7K3QX2',
      siteHost: 'example.com',
      pickupAt,
      durationMinutes: 45,
      pickupAddress: 'AIA; Terminal 1, Athens',
      officePhone: '+30 210 970 6967',
      summary: 'Elite Protection · EP-7K3QX2',
      now,
    });

    expect(ics).toMatch(/\r\n/);
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics).toContain('UID:EP-7K3QX2@example.com');
    expect(ics).toContain('DTSTAMP:20261001T120000Z');
    expect(ics).toContain('DTSTART:20261024T083000Z');
    expect(ics).toContain('DURATION:PT45M');
    expect(ics).toContain(`LOCATION:${icsEscape('AIA; Terminal 1, Athens')}`);
    expect(ics).toContain('DESCRIPTION:Elite Protection · +30 210 970 6967');

    const parsed = parseIcs(ics);
    expect(parsed.uid).toBe('EP-7K3QX2@example.com');
    expect(parsed.dtstart).toBe('20261024T083000Z');
    expect(new Date(
      Date.UTC(2026, 9, 24, 8, 30, 0),
    ).toISOString()).toBe(pickupAt.toISOString());
  });
});

/** Tiny RFC 5545 line parser for tests. */
function parseIcs(raw: string): { uid?: string; dtstart?: string; dtstamp?: string } {
  const out: { uid?: string; dtstart?: string; dtstamp?: string } = {};
  for (const line of raw.split(/\r\n/)) {
    if (line.startsWith('UID:')) out.uid = line.slice(4);
    if (line.startsWith('DTSTART:')) out.dtstart = line.slice(8);
    if (line.startsWith('DTSTAMP:')) out.dtstamp = line.slice(8);
  }
  return out;
}
