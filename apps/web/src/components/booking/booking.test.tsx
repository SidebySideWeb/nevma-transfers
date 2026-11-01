/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { bookingReducer, createInitialState } from './reducer';
import { StepDetails } from './StepDetails';
import { StepSearch } from './StepSearch';
import type { OptionsData } from './types';
import { initialDetails, initialSearch } from './types';

const strings: Record<string, string> = {
  'booking.search.title': 'Book your ride',
  'booking.toggle.transfer': 'Transfer',
  'booking.toggle.hourly': 'By the hour',
  'booking.pickup.zone': 'Pick-up area',
  'booking.dropoff.zone': 'Drop-off area',
  'booking.hours.label': 'Number of hours',
  'booking.hours.hint': 'Minimum {min} hours, maximum {max} hours.',
  'booking.pickup.datetime': 'Pick-up date and time',
  'booking.athensHint': 'Athens time',
  'booking.passengers': 'Passengers',
  'booking.luggage': 'Luggage',
  'booking.search.submit': 'See vehicles',
  'booking.loading': 'Please wait…',
  'booking.errors.summary': 'Please fix',
  'booking.details.title': 'Your details',
  'booking.pickup.address': 'Pick-up address',
  'booking.dropoff.address': 'Drop-off address',
  'booking.flight': 'Flight',
  'booking.details.name': 'Name',
  'booking.details.email': 'Email',
  'booking.details.phone': 'Phone',
  'booking.details.notes': 'Notes',
  'booking.extras.title': 'Extras',
  'booking.extras.night': 'Night surcharge',
  'booking.extras.vip': 'VIP security',
  'booking.extras.vip.hint': 'VIP hint',
  'booking.invoice.toggle': 'I need an invoice',
  'booking.consent': 'I accept',
  'booking.back': 'Back',
  'booking.continue': 'Continue',
  'booking.hold.timer': 'Held for {minutes} minutes.',
  'booking.hold.warning': '2 minutes left',
};

const options: OptionsData = {
  timezone: 'Europe/Athens',
  minLeadMinutes: 120,
  holdMinutes: 20,
  zones: [
    { code: 'demo-airport', name: 'Airport' },
    { code: 'demo-centre', name: 'Centre' },
  ],
  classes: [
    {
      key: 'demo-e-class',
      name: 'Sedan',
      maxPassengers: 3,
      maxLuggage: 3,
      hourly: { minHours: 3, maxHours: 12 },
      photo: null,
      tagline: 'Tag',
    },
  ],
  extras: [
    {
      code: 'night-surcharge',
      name: 'Night',
      priceCents: 1500,
      appliesTo: ['transfer', 'hourly'],
      maxQuantity: 1,
    },
    {
      code: 'vip-security',
      name: 'VIP',
      priceCents: 15000,
      appliesTo: ['transfer', 'hourly'],
      maxQuantity: 1,
    },
    {
      code: 'child-seat',
      name: 'Child seat',
      priceCents: 1000,
      appliesTo: ['transfer'],
      maxQuantity: 3,
    },
  ],
};

describe('booking reducer', () => {
  it('transitions quote → vehicle and hold → details', () => {
    let s = createInitialState();
    s = bookingReducer(s, {
      type: 'QUOTE_OK',
      quote: {
        pickupAt: '2026-12-01T10:00:00+02:00',
        durationMinutes: 45,
        currency: 'EUR',
        options: [{ classKey: 'demo-e-class', baseCents: 7000, available: true }],
      },
    });
    expect(s.step).toBe('vehicle');
    s = bookingReducer(s, {
      type: 'HOLD_OK',
      hold: {
        holdId: 'h1',
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        classKey: 'demo-e-class',
        baseCents: 7000,
      },
      classKey: 'demo-e-class',
      serverSkewMs: 0,
    });
    expect(s.step).toBe('details');
    s = bookingReducer(s, { type: 'HOLD_EXPIRED' });
    expect(s.step).toBe('vehicle');
    expect(s.holdExpiredMessage).toBe(true);
    expect(s.details).toEqual(initialDetails());
  });
});

describe('StepSearch hourly', () => {
  it('hides drop-off for hourly', async () => {
    const user = userEvent.setup();
    const search = { ...initialSearch(), fromZone: 'demo-airport', toZone: 'demo-centre' };
    const onChange = vi.fn();
    const { rerender } = render(
      <StepSearch
        strings={strings}
        options={options}
        search={search}
        errors={{}}
        formError={null}
        busy={false}
        onChange={onChange}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Drop-off area')).toBeTruthy();
    await user.click(screen.getByLabelText('By the hour'));
    expect(onChange).toHaveBeenCalledWith({ type: 'hourly' });
    rerender(
      <StepSearch
        strings={strings}
        options={options}
        search={{ ...search, type: 'hourly' }}
        errors={{}}
        formError={null}
        busy={false}
        onChange={onChange}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Drop-off area')).toBeNull();
    expect(screen.getByLabelText('Number of hours')).toBeTruthy();
  });
});

describe('StepDetails VIP', () => {
  it('VIP unchecked by default', () => {
    render(
      <StepDetails
        strings={strings}
        options={options}
        search={{ ...initialSearch(), fromZone: 'demo-airport', toZone: 'demo-centre' }}
        hold={{
          holdId: 'h',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          classKey: 'demo-e-class',
          baseCents: 7000,
        }}
        details={initialDetails()}
        selectedClassKey="demo-e-class"
        serverSkewMs={0}
        errors={{}}
        formError={null}
        busy={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        onHoldExpired={vi.fn()}
      />,
    );
    const vip = screen.getByRole('checkbox', { name: /VIP security/i }) as HTMLInputElement;
    expect(vip.checked).toBe(false);
  });
});

describe('api bodies never send money fields', () => {
  it('fetch spy rejects price/amount/total/Cents keys', async () => {
    const bodies: unknown[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_url, init) => {
      if (init?.body) bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ options: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const { bookingApi } = await import('./api');
    await bookingApi.quote({
      type: 'transfer',
      fromZone: 'demo-airport',
      toZone: 'demo-centre',
      pickupLocal: '2026-12-01T10:00',
      passengers: 2,
      luggage: 2,
    });
    globalThis.fetch = orig;

    const walk = (v: unknown): void => {
      if (!v || typeof v !== 'object') return;
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        expect(k === 'price' || k === 'amount' || k === 'total' || k.endsWith('Cents')).toBe(false);
        walk(child);
      }
    };
    bodies.forEach(walk);
  });
});
