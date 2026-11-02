import { describe, expect, it } from 'vitest';
import {
  contactSchema,
  transferRequestSchema,
  vipSecuritySchema,
  zodFields,
} from './schemas';

const zones = ['demo-airport', 'demo-centre'];
const classes = ['demo-v-class'];
const now = new Date('2026-11-01T12:00:00.000Z');

function futureLocal(): string {
  return '2026-12-01T10:00';
}

describe('form schemas validation', () => {
  it('each required transfer field missing → matching field error key', () => {
    const schema = transferRequestSchema({ zoneCodes: zones, classKeys: classes, now });
    const base = {
      name: 'Ada',
      email: 'ada@example.com',
      phone: '+30 210 0000000',
      fromZone: 'demo-airport',
      toZone: 'demo-centre',
      datetime: futureLocal(),
      passengers: 2,
      consent: true,
    };
    for (const key of ['name', 'email', 'phone', 'fromZone', 'toZone', 'datetime', 'passengers', 'consent'] as const) {
      const body = { ...base };
      delete (body as Record<string, unknown>)[key];
      const result = schema.safeParse(body);
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = zodFields(result.error);
        expect(fields[key]).toBeTruthy();
      }
    }
  });

  it('toZone = fromZone (both not other) is rejected', () => {
    const schema = transferRequestSchema({ zoneCodes: zones, classKeys: classes, now });
    const result = schema.safeParse({
      name: 'Ada',
      email: 'ada@example.com',
      phone: '+30 210 0000000',
      fromZone: 'demo-airport',
      toZone: 'demo-airport',
      datetime: futureLocal(),
      passengers: 2,
      consent: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(zodFields(result.error).toZone).toBe('form.error.required');
    }
  });

  it('non-existent local time is rejected', () => {
    const schema = transferRequestSchema({ zoneCodes: zones, classKeys: classes, now });
    const result = schema.safeParse({
      name: 'Ada',
      email: 'ada@example.com',
      phone: '+30 210 0000000',
      fromZone: 'demo-airport',
      toZone: 'demo-centre',
      datetime: '2027-03-28T03:30',
      passengers: 2,
      consent: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(zodFields(result.error).datetime).toBe('form.error.required');
    }
  });

  it('accepts V2 request fields flight and kind (strict schema)', () => {
    const schema = transferRequestSchema({ zoneCodes: zones, classKeys: classes, now });
    const result = schema.safeParse({
      name: 'Ada',
      email: 'ada@example.com',
      phone: '+30 210 0000000',
      fromZone: 'demo-airport',
      toZone: 'demo-centre',
      datetime: futureLocal(),
      passengers: 2,
      luggage: 2,
      flight: 'A3 650',
      kind: 'One-off transfer',
      vehicleClass: 'any',
      consent: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.flight).toBe('A3 650');
      expect(result.data.kind).toBe('One-off transfer');
    }
  });

  it('fromOther required when fromZone is other', () => {
    const schema = transferRequestSchema({ zoneCodes: zones, classKeys: classes, now });
    const result = schema.safeParse({
      name: 'Ada',
      email: 'ada@example.com',
      phone: '+30 210 0000000',
      fromZone: 'other',
      toZone: 'demo-centre',
      datetime: futureLocal(),
      passengers: 2,
      consent: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(zodFields(result.error).fromOther).toBe('form.error.required');
    }
  });

  it('vip-security and contact required fields', () => {
    const vip = vipSecuritySchema({ now }).safeParse({
      email: 'ada@example.com',
      phone: '+30 210 0000000',
      serviceType: 'Event',
      consent: true,
    });
    expect(vip.success).toBe(false);
    if (!vip.success) expect(zodFields(vip.error).name).toBe('form.error.required');

    const contact = contactSchema({ topicKeys: ['booking'] }).safeParse({
      name: 'Ada',
      email: 'ada@example.com',
      topic: 'booking',
      consent: true,
    });
    expect(contact.success).toBe(false);
    if (!contact.success) expect(zodFields(contact.error).message).toBe('form.error.required');
  });
});
