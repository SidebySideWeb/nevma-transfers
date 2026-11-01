import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingError } from '../booking/types';
import { FORM_KEYS, type FormKey } from '../forms/schemas';
import { setEmailTransport, type SendEmailInput } from './email';
import {
  setFormCatalog,
  setFormRateLimit,
  submitForm,
  type FormDoc,
} from './form-service';
import {
  setSanityWriter,
  type SanityWriter,
  type SubmissionDoc,
} from './sanity-write';
import { resetTurnstileVerifier, setTurnstileVerifier } from './turnstile';
import { runFormRetention } from '../../pages/api/cron/form-retention';

const futureLocal = () => {
  const d = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Athens',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
};

const forms: Record<FormKey, FormDoc> = {
  'transfer-request': {
    _id: 'form-transfer-request',
    key: 'transfer-request',
    title: 'Request a transfer',
    recipientEmail: 'office@example.com',
    retentionMonths: 24,
  },
  'vip-security': {
    _id: 'form-vip-security',
    key: 'vip-security',
    title: 'VIP security enquiry',
    recipientEmail: 'security@example.com',
    retentionMonths: 24,
  },
  contact: {
    _id: 'form-contact',
    key: 'contact',
    title: 'Contact us',
    recipientEmail: 'office@example.com',
    retentionMonths: 24,
    topics: [
      { key: 'booking', label: 'An existing booking' },
      { key: 'vip-security', label: 'VIP security', recipientEmail: 'security@example.com' },
    ],
  },
};

function catalog() {
  return {
    forms,
    zones: [
      { code: 'demo-airport', name: 'DEMO Airport' },
      { code: 'demo-centre', name: 'DEMO Centre' },
    ],
    classes: [{ key: 'demo-v-class', name: 'DEMO Van' }],
    company: {
      companyName: 'Elite Protection',
      companyPhone: '+30 210 0000000',
      companyEmail: 'info@example.com',
    },
  };
}

function validBodies(): Record<FormKey, Record<string, unknown>> {
  return {
    'transfer-request': {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+30 210 1111111',
      fromZone: 'demo-airport',
      toZone: 'demo-centre',
      datetime: futureLocal(),
      passengers: 2,
      luggage: 1,
      vehicleClass: 'demo-v-class',
      consent: true,
      'cf-turnstile-response': 'ok',
    },
    'vip-security': {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+30 210 1111111',
      serviceType: 'Close protection',
      date: '2026-12-15',
      consent: true,
      'cf-turnstile-response': 'ok',
    },
    contact: {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      topic: 'vip-security',
      message: 'Please call me about security.',
      consent: true,
      'cf-turnstile-response': 'ok',
    },
  };
}

describe('forms API (prompt 21)', () => {
  let creates: SubmissionDoc[];
  let emails: SendEmailInput[];
  let rateHits: Map<string, number>;
  let logLines: string[];
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let writerFail = false;
  let store: { id: string; formKey: FormKey; submittedAt: string }[];

  beforeEach(() => {
    creates = [];
    emails = [];
    rateHits = new Map();
    logLines = [];
    writerFail = false;
    store = [];
    setFormCatalog(catalog());
    setTurnstileVerifier(async () => true);
    setFormRateLimit(async (key, _window, max) => {
      const n = (rateHits.get(key) ?? 0) + 1;
      rateHits.set(key, n);
      if (n > max) {
        throw new BookingError('invalid_request', {
          stringKey: 'error.invalid_request',
          message: 'rate_limit',
        });
      }
    });
    setEmailTransport(async (input) => {
      emails.push(input);
      return { ok: true, status: 200 };
    });
    const writer: SanityWriter = {
      async create(doc) {
        if (writerFail) throw new Error('sanity_down');
        creates.push(doc);
        store.push({ id: doc._id, formKey: doc.formKey, submittedAt: doc.submittedAt });
        return { _id: doc._id };
      },
      async patchEmailStatus() {
        /* no-op */
      },
      async deleteOlderThan(formKey, isoDate, batch = 100) {
        const before = store.filter((s) => s.formKey === formKey && s.submittedAt < isoDate);
        const take = before.slice(0, batch);
        const ids = new Set(take.map((t) => t.id));
        store = store.filter((s) => !ids.has(s.id));
        return take.length;
      },
    };
    setSanityWriter(writer);
    errorSpy = vi.spyOn(console, 'error').mockImplementation((msg?: unknown) => {
      logLines.push(String(msg));
    });
    infoSpy = vi.spyOn(console, 'info').mockImplementation((msg?: unknown) => {
      logLines.push(String(msg));
    });
  });

  afterEach(() => {
    setFormCatalog(null);
    setFormRateLimit(null);
    setSanityWriter(null);
    setEmailTransport(null);
    resetTurnstileVerifier();
    errorSpy.mockRestore();
    infoSpy.mockRestore();
  });

  function assertNoPiiInLogs() {
    const joined = logLines.join('\n');
    expect(joined).not.toMatch(/Ada Lovelace/);
    expect(joined).not.toMatch(/ada@example\.com/);
    expect(joined).not.toMatch(/\+30 210 1111111/);
    expect(joined).not.toMatch(/Please call me/);
  }

  it('AC-27: one valid post per form → create + office + confirm; topic recipient; JSON ok', async () => {
    const bodies = validBodies();
    for (const key of FORM_KEYS) {
      creates = [];
      emails = [];
      const result = await submitForm(key, bodies[key], { ip: '203.0.113.10' });
      expect(result.ok).toBe(true);
      expect(result.redirect).toBe(`/thank-you/${key}`);
      expect(creates).toHaveLength(1);
      expect(creates[0].formKey).toBe(key);
      expect(creates[0].status).toBe('new');
      expect(creates[0].answers.length).toBeGreaterThan(0);
      expect(creates[0].answers.every((a) => a.label && a.value !== undefined)).toBe(true);

      const office = emails.find((e) => e.tag === 'form_office');
      const confirm = emails.find((e) => e.tag === 'form_confirm');
      expect(office).toBeTruthy();
      expect(confirm).toBeTruthy();
      expect(confirm!.to).toBe('ada@example.com');
      expect(office!.replyTo).toBe('ada@example.com');

      if (key === 'contact') {
        expect(office!.to).toBe('security@example.com');
      } else if (key === 'vip-security') {
        expect(office!.to).toBe('security@example.com');
      } else {
        expect(office!.to).toBe('office@example.com');
      }
    }
    assertNoPiiInLogs();
  });

  it('AC-27: Sanity write fails → office email still sent, success; both fail → form.error.generic', async () => {
    writerFail = true;
    const result = await submitForm('contact', validBodies().contact, { ip: '203.0.113.20' });
    expect(result.ok).toBe(true);
    expect(creates).toHaveLength(0);
    expect(emails.some((e) => e.tag === 'form_office')).toBe(true);
    expect(logLines.some((l) => l.includes('sanity_write_failed'))).toBe(true);
    assertNoPiiInLogs();

    emails = [];
    setEmailTransport(async () => ({ ok: false, status: 500 }));
    const both = await submitForm('contact', validBodies().contact, { ip: '203.0.113.21' });
    expect(both.ok).toBe(false);
    expect(both.message).toMatch(/could not send/i);
    expect(logLines.some((l) => l.includes('form_submit_failed'))).toBe(true);
    assertNoPiiInLogs();
  });

  it('AC-28: honeypot → thank-you, no Sanity, no email; bad Turnstile → 400; 6th → 429', async () => {
    const result = await submitForm(
      'contact',
      { ...validBodies().contact, website: 'http://spam.example' },
      { ip: '203.0.113.30' },
    );
    expect(result.ok).toBe(true);
    expect(result.redirect).toBe('/thank-you/contact');
    expect(creates).toHaveLength(0);
    expect(emails).toHaveLength(0);

    setTurnstileVerifier(async () => false);
    const bad = await submitForm('contact', validBodies().contact, { ip: '203.0.113.31' });
    expect(bad.ok).toBe(false);
    expect(bad.status).toBe(400);

    setTurnstileVerifier(async () => true);
    const ip = '203.0.113.32';
    for (let i = 0; i < 5; i++) {
      const ok = await submitForm('contact', validBodies().contact, { ip });
      expect(ok.ok).toBe(true);
    }
    const sixth = await submitForm('contact', validBodies().contact, { ip });
    expect(sixth.ok).toBe(false);
    expect(sixth.status).toBe(429);
    assertNoPiiInLogs();
  });

  it('AC-30: retention deletes only older than retentionMonths; no CRON_SECRET → 401', async () => {
    const now = new Date('2026-11-01T00:00:00.000Z');
    const monthsAgo = (n: number) => {
      const d = new Date(now.getTime());
      d.setUTCMonth(d.getUTCMonth() - n);
      return d.toISOString();
    };
    store = [
      { id: 'submission-old-25', formKey: 'contact', submittedAt: monthsAgo(25) },
      { id: 'submission-old-23', formKey: 'contact', submittedAt: monthsAgo(23) },
    ];
    const counts = await runFormRetention(now);
    expect(counts.contact).toBe(1);
    expect(store.map((s) => s.id)).toEqual(['submission-old-23']);
    expect(logLines.some((l) => l.includes('form_retention') && l.includes('"deleted":1'))).toBe(
      true,
    );

    const { GET } = await import('../../pages/api/cron/form-retention');
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-cron-secret';
    try {
      const unauthorized = await GET({
        request: new Request('http://localhost/api/cron/form-retention'),
      } as Parameters<typeof GET>[0]);
      expect(unauthorized.status).toBe(401);
    } finally {
      if (prev == null) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });
});
