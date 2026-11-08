/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SEARCH_PLACES_KEY,
  SearchWidget,
  searchWidgetQuery,
  type FeaturedPlace,
  type FeaturedRoute,
  type SearchWidgetProps,
} from './SearchWidget';

const aia: FeaturedPlace = {
  code: 'aia',
  name: 'Athens Airport',
  address: 'Athens International Airport, Spata',
  placeId: 'pid-aia',
  lat: 37.9364,
  lng: 23.9445,
  kind: 'airport',
};
const syn: FeaturedPlace = {
  code: 'syntagma',
  name: 'Syntagma',
  address: 'Syntagma Square, Athens',
  placeId: 'pid-syn',
  lat: 37.9755,
  lng: 23.7348,
  kind: 'area',
};
const pir: FeaturedPlace = {
  code: 'piraeus',
  name: 'Piraeus Port',
  address: 'Piraeus Port, Piraeus',
  placeId: 'pid-pir',
  lat: 37.9427,
  lng: 23.6466,
  kind: 'port',
};
const routes: FeaturedRoute[] = [
  { from: aia, to: syn, durationMin: 40, fromPriceCents: 6500 },
  { from: pir, to: syn, durationMin: 30, fromPriceCents: 5500 },
];

// 08:03 UTC = 10:03 Athens; +120 min lead = 12:03; rounded up to 10 min = 12:10.
const now = new Date('2026-12-01T08:03:00Z');

function setup(over: Partial<SearchWidgetProps> = {}) {
  return render(
    <SearchWidget
      mode="book"
      routes={routes}
      now={now}
      minLeadMinutes={120}
      timezone="Europe/Athens"
      kmPerHour={40}
      hourBounds={{ min: 3, max: 12 }}
      {...over}
    />,
  );
}

const routeOpt = (re: RegExp) => screen.queryByRole('option', { name: re });

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('SearchWidget', () => {
  it('focus expands the panel and Esc / outside click collapse it', async () => {
    const user = userEvent.setup();
    setup();
    const pickup = screen.getByLabelText('Pick-up');
    expect(pickup.getAttribute('aria-expanded')).toBe('false');
    await user.click(pickup);
    expect(pickup.getAttribute('aria-expanded')).toBe('true');
    expect(pickup.getAttribute('aria-controls')).toBe(document.querySelector('.ep-sw-panel')!.id);
    expect(screen.getByText('Fixed zones')).toBeTruthy();
    expect(screen.getByText('Popular routes')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(pickup.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Fixed zones')).toBeNull();

    await user.click(pickup);
    expect(pickup.getAttribute('aria-expanded')).toBe('true');
    await user.click(document.body);
    expect(pickup.getAttribute('aria-expanded')).toBe('false');
  });

  it('panel content follows the focused field', async () => {
    const user = userEvent.setup();
    setup({ emptyMessage: 'Anywhere in Attica.' });
    const date = screen.getByRole('combobox', { name: 'Date' });
    const time = screen.getByRole('combobox', { name: 'Pick-up time' });
    await user.click(date);
    expect(screen.getByRole('dialog', { name: 'Date' })).toBeTruthy();
    await user.click(time);
    expect(screen.getByRole('listbox', { name: 'Pick-up time' })).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: 'By the hour' }));
    await user.click(screen.getByLabelText('Pick-up'));
    expect(screen.getByText('Anywhere in Attica.')).toBeTruthy(); // no routes by the hour
    await user.click(screen.getByLabelText('Duration'));
    expect(screen.getByRole('option', { name: '3 hours (120 km included)' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '12 hours (480 km included)' })).toBeTruthy();
  });

  it('a popular route fills pick-up and drop-off with place data and moves to Date', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    setup({ onChange });
    await user.click(screen.getByLabelText('Pick-up'));
    await user.click(routeOpt(/Athens Airport → Syntagma/)!);

    expect((screen.getByLabelText('Pick-up') as HTMLInputElement).value).toBe(aia.address);
    expect((screen.getByLabelText('Drop-off') as HTMLInputElement).value).toBe(syn.address);
    const date = screen.getByRole('combobox', { name: 'Date' });
    expect(document.activeElement).toBe(date);
    expect(date.getAttribute('aria-expanded')).toBe('true');
    // Airport pick-up reveals the flight field.
    expect(screen.getByLabelText('Flight number')).toBeTruthy();

    expect(onChange).toHaveBeenLastCalledWith({
      search: expect.objectContaining({ type: 'transfer', fromZone: 'aia', toZone: 'syntagma', pickupLocal: '' }),
      details: expect.objectContaining({
        pickupAddress: aia.address,
        dropoffAddress: syn.address,
        pickupPlace: { placeId: 'pid-aia', lat: aia.lat, lng: aia.lng },
        dropoffPlace: { placeId: 'pid-syn', lat: syn.lat, lng: syn.lng },
      }),
    });
  });

  it('drop-off focus lists fixed zones from the chosen pick-up', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByLabelText('Pick-up'));
    expect(screen.getByRole('option', { name: 'Athens Airport' })).toBeTruthy();
    expect(routeOpt(/Athens Airport → Syntagma/)).toBeTruthy();
    await user.click(screen.getByRole('option', { name: 'Athens Airport' }));

    expect((screen.getByLabelText('Pick-up') as HTMLInputElement).value).toBe(aia.address);
    await user.click(screen.getByLabelText('Drop-off'));
    expect(screen.getByRole('option', { name: 'Syntagma' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Piraeus Port' })).toBeNull();
    expect(screen.getByText(/Any address/)).toBeTruthy();
  });

  it('time list: 24 h, 10-minute steps, default = now + lead rounded up, min notice disabled', async () => {
    const user = userEvent.setup();
    setup({ initial: { date: '2026-12-01' } });
    const time = screen.getByRole('combobox', { name: 'Pick-up time' });
    expect(time.textContent).toContain('12:10');
    await user.click(time);
    const opts = screen.getAllByRole('option') as HTMLButtonElement[];
    const labels = opts.map((o) => o.textContent!);
    expect(labels).toHaveLength(144);
    expect(labels.every((l) => /^\d{2}:\d{2}$/.test(l))).toBe(true);
    expect(labels.join('')).not.toMatch(/AM|PM/i);
    const mins = labels.map((l) => Number(l.slice(0, 2)) * 60 + Number(l.slice(3)));
    expect(mins.every((m, i) => m === i * 10)).toBe(true);
    const at = (t: string) => opts.find((o) => o.textContent === t)!;
    expect(at('12:00').disabled).toBe(true);
    expect(at('12:10').disabled).toBe(false);
    expect(at('12:10').getAttribute('aria-selected')).toBe('true');
  });

  it('time before min notice is bumped when a first-day date is chosen; later days keep it', async () => {
    const user = userEvent.setup();
    setup({ initial: { time: '09:00' } });
    await user.click(screen.getByRole('combobox', { name: 'Date' }));
    // Past months are not reachable; the 1st is still allowed (today).
    expect((screen.getByRole('button', { name: 'Previous month' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '1 December 2026' }));
    expect(screen.getByRole('combobox', { name: 'Pick-up time' }).textContent).toContain('12:10');

    await user.click(screen.getByRole('combobox', { name: 'Date' }));
    await user.click(screen.getByRole('button', { name: '3 December 2026' }));
    await user.click(screen.getByRole('option', { name: '09:30' }));
    expect(screen.getByRole('combobox', { name: 'Pick-up time' }).textContent).toContain('09:30');
    expect(screen.getByRole('combobox', { name: 'Pick-up time' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps focus inside the widget while open (Tab wraps)', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByLabelText('Pick-up'));
    const ctas = screen.getAllByRole('button', { name: 'View options' });
    ctas[ctas.length - 1]!.focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'By route' }));
  });

  it.each(['home', 'book'] as const)('%s mode: the same component, same expand behaviour', async (mode) => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const onSubmit = vi.fn();
    setup({ mode, navigate, onSubmit });
    const pickup = screen.getByLabelText('Pick-up');
    await user.click(pickup);
    expect(pickup.getAttribute('aria-expanded')).toBe('true');
    await user.click(routeOpt(/Athens Airport → Syntagma/)!);
    await user.click(screen.getByRole('button', { name: '2 December 2026' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'View options' }));

    if (mode === 'home') {
      expect(onSubmit).not.toHaveBeenCalled();
      const href = navigate.mock.calls[0]![0] as string;
      const q = new URL(href, 'http://x').searchParams;
      expect(href.startsWith('/book?')).toBe(true);
      expect(Object.fromEntries(q)).toEqual({
        type: 'transfer',
        from: 'aia',
        to: 'syntagma',
        date: '2026-12-02',
        time: '12:10',
        passengers: '2',
      });
      expect(JSON.parse(sessionStorage.getItem(SEARCH_PLACES_KEY)!).pickupPlace.placeId).toBe('pid-aia');
    } else {
      expect(navigate).not.toHaveBeenCalled();
      expect(onSubmit).toHaveBeenCalledWith({
        search: expect.objectContaining({ pickupLocal: '2026-12-02T12:10', fromZone: 'aia', toZone: 'syntagma' }),
        details: expect.objectContaining({ pickupPlace: expect.objectContaining({ placeId: 'pid-aia' }) }),
      });
    }
  });

  it('never puts a price in the query', () => {
    const href = searchWidgetQuery(
      {
        search: { type: 'hourly', hours: 4, pickupLocal: '2026-12-02T10:00' },
        details: {
          pickupAddress: 'x',
          dropoffAddress: '',
          pickupPlace: null,
          dropoffPlace: null,
          flightNumber: '',
        },
      },
      3,
    );
    expect(new URL(href, 'http://x').searchParams.toString()).toBe(
      'type=hourly&date=2026-12-02&time=10%3A00&hours=4&passengers=3',
    );
  });
});
