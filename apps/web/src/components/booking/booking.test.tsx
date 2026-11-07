/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookingReducer, createInitialState } from './reducer';
import { StepDetails } from './StepDetails';
import { StepSearch } from './StepSearch';
import type { OptionsData } from './types';
import { initialDetails, initialSearch } from './types';

const strings: Record<string, string> = {
  'booking.search.title': 'Book your ride',
  'booking.toggle.transfer': 'Transfer',
  'booking.toggle.oneWay': 'One way',
  'booking.toggle.hourly': 'By the hour',
  'booking.pickup.zone': 'Pick-up',
  'booking.dropoff.zone': 'Drop-off',
  'booking.hours.label': 'Number of hours',
  'booking.hours.duration': 'Duration',
  'booking.hours.hint': 'Minimum {min} hours, maximum {max} hours.',
  'booking.hourly.differentDropoff': 'Different drop-off address',
  'booking.pickup.datetime': 'Pick-up date and time',
  'booking.athensHint': 'Athens time',
  'booking.passengers': 'Passengers',
  'booking.luggage': 'Luggage',
  'booking.search.submit': 'See vehicles',
  'booking.search.viewOptions': 'View options',
  'booking.loading': 'Please wait…',
  'booking.errors.summary': 'Please fix',
  'booking.details.title': 'Your details',
  'booking.pickup.address': 'Pick-up address',
  'booking.dropoff.address': 'Drop-off address',
  'booking.flight': 'Flight number',
  'booking.airport.hint': 'Add your flight number so your chauffeur meets you at arrivals.',
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
  'booking.swap': 'Swap pick-up and drop-off',
  'booking.date': 'Date',
  'booking.time': 'Pick-up time',
  'booking.quoteLink': 'Route not listed? Request a quote',
  'form.stepper.fewer': 'Fewer',
  'form.stepper.more': 'More',
  'form.placeholder.flight': 'e.g. A3 603, LH1284',
  'booking.extras.label': 'Optional add-on',
  'booking.review.submit': 'Review & pay',
  'booking.step.vehicle': 'Vehicle',
  'booking.serviceArea.outOfArea': 'We only serve Athens and Attica. For other destinations, {contact}.',
  'booking.serviceArea.contact': 'contact us',
};

const options: OptionsData = {
  timezone: 'Europe/Athens',
  minLeadMinutes: 180,
  holdMinutes: 20,
  kmPerHour: 40,
  waitingAirportFreeMin: 60,
  returnTrip: false,
  flightTracking: false,
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

afterEach(cleanup);

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

describe('StepSearch Blacklane bar', () => {
  it('tab switch keeps shared fields and shows hourly km labels', async () => {
    const user = userEvent.setup();
    const search = {
      ...initialSearch(),
      fromZone: 'demo-airport',
      toZone: 'demo-centre',
      pickupLocal: '2026-12-01T14:00',
      hours: 4,
    };
    const details = {
      ...initialDetails(),
      pickupAddress: 'Terminal',
      dropoffAddress: 'Syntagma',
    };
    const onChange = vi.fn();
    const { rerender } = render(
      <StepSearch
        strings={strings}
        options={options}
        search={search}
        details={details}
        errors={{}}
        formError={null}
        busy={false}
        addressAutocomplete={false}
        onChange={onChange}
        onChangeDetails={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('Terminal')).toBeTruthy();
    expect(screen.getByLabelText('Flight number')).toBeTruthy();
    expect(screen.getByText(/Add your flight number/i)).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'By the hour' }));
    expect(onChange).toHaveBeenCalledWith({ type: 'hourly' });
    rerender(
      <StepSearch
        strings={strings}
        options={options}
        search={{ ...search, type: 'hourly' }}
        details={details}
        errors={{}}
        formError={null}
        busy={false}
        addressAutocomplete={false}
        onChange={onChange}
        onChangeDetails={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('Terminal')).toBeTruthy();
    expect(screen.getAllByText('4 hours (160 km included)').length).toBeGreaterThan(0);
    // Airport pick-up zone still shows the flight field in hourly mode.
    expect(screen.getByLabelText('Flight number')).toBeTruthy();
  });

  it('hides flight field when pick-up is not an airport', () => {
    render(
      <StepSearch
        strings={strings}
        options={options}
        search={{ ...initialSearch(), fromZone: 'demo-centre', toZone: 'demo-airport' }}
        details={initialDetails()}
        errors={{}}
        formError={null}
        busy={false}
        addressAutocomplete={false}
        onChange={vi.fn()}
        onChangeDetails={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Flight number')).toBeNull();
  });
});

describe('StepDetails VIP', () => {
  const renderDetails = (onChange = vi.fn(), extras: { code: string; quantity: number }[] = []) =>
    render(
      <StepDetails
        strings={strings}
        options={options}
        search={{ ...initialSearch(), fromZone: 'demo-airport', toZone: 'demo-centre' }}
        details={{ ...initialDetails(), extras }}
        errors={{}}
        formError={null}
        busy={false}
        onChange={onChange}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />,
    );

  it('VIP unchecked by default', () => {
    renderDetails();
    const vip = screen.getByRole('switch', { name: /VIP security/i });
    expect(vip.getAttribute('aria-checked')).toBe('false');
    expect(vip.className).toBe('addon s651d2');
  });

  it('VIP switch turns on with the design on-state classes and sends the extra', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { unmount } = renderDetails(onChange);
    await user.click(screen.getByRole('switch', { name: /VIP security/i }));
    expect(onChange).toHaveBeenCalledWith({ extras: [{ code: 'vip-security', quantity: 1 }] });
    unmount();
    renderDetails(vi.fn(), [{ code: 'vip-security', quantity: 1 }]);
    const on = screen.getByRole('switch', { name: /VIP security/i });
    expect(on.getAttribute('aria-checked')).toBe('true');
    expect(on.className).toBe('addon sbdbb7');
  });

  it('invoice disclosure is a button with aria-expanded that reveals the company fields', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderDetails(onChange);
    const toggle = screen.getByRole('button', { name: /I need an invoice/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ needInvoice: true });
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
