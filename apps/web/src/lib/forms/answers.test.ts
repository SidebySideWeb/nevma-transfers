import { describe, expect, it } from 'vitest';
import { toAnswers } from './answers';
import type { TransferRequestData } from './schemas';

describe('toAnswers', () => {
  it('formats transfer answers with zone names and Athens local time', () => {
    const data = {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+30 210 0000000',
      fromZone: 'demo-airport',
      toZone: 'demo-centre',
      datetime: '2026-12-01T10:00',
      passengers: 2,
      luggage: 1,
      vehicleClass: 'demo-v-class',
      vipSecurity: false,
      invoice: false,
      flight: 'A3 650',
      kind: 'One-off transfer',
      consent: true as const,
    } as TransferRequestData;

    const answers = toAnswers('transfer-request', data, {
      zoneNames: { 'demo-airport': 'DEMO Airport', 'demo-centre': 'DEMO Centre' },
      classNames: { 'demo-v-class': 'DEMO Van' },
      timeZone: 'Europe/Athens',
    });

    expect(answers.find((a) => a.key === 'fromZone')?.value).toBe('DEMO Airport');
    expect(answers.find((a) => a.key === 'toZone')?.value).toBe('DEMO Centre');
    expect(answers.find((a) => a.key === 'datetime')?.value).toBe('Tue 1 Dec 2026, 10:00 (Athens)');
    expect(answers.find((a) => a.key === 'vehicleClass')?.value).toBe('DEMO Van');
    expect(answers.find((a) => a.key === 'vipSecurity')?.value).toBe('No');
    expect(answers.find((a) => a.key === 'flight')?.value).toBe('A3 650');
    expect(answers.find((a) => a.key === 'kind')?.value).toBe('One-off transfer');
  });
});
