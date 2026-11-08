/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { BrandDropdown } from './BrandDropdown';
import { QuickBooking, quickBookingQuery } from './QuickBooking';

const options = [
  { value: 'ath-airport', label: 'Athens International Airport (AIA)' },
  { value: 'athens-centre', label: 'Athens' },
  { value: 'piraeus-port', label: 'Piraeus port' },
];

function Harness() {
  const [v, setV] = useState('ath-airport');
  return (
    <BrandDropdown
      id="q-from"
      name="from"
      label="From"
      options={options}
      value={v}
      onChange={setV}
    />
  );
}

const native = (c: HTMLElement) => c.querySelector('select') as HTMLSelectElement;

afterEach(cleanup);

describe('BrandDropdown', () => {
  it('opens, arrows, Home/End, Enter, Escape and updates the hidden select', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const btn = screen.getByRole('button', { name: /From/i });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.focus();
    await user.keyboard('{ArrowDown}');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.getAttribute('aria-activedescendant')).toBe('q-from-opt-0');
    await user.keyboard('{End}');
    expect(btn.getAttribute('aria-activedescendant')).toBe('q-from-opt-2');
    await user.keyboard('{Home}');
    expect(btn.getAttribute('aria-activedescendant')).toBe('q-from-opt-0');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(native(container).value).toBe('athens-centre');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(btn);
  });

  it('type-ahead moves to the matching option', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const btn = screen.getByRole('button', { name: /From/i });
    btn.focus();
    await user.keyboard('{ArrowDown}pi{Enter}');
    expect(native(container).value).toBe('piraeus-port');
  });

  it('Escape closes without changing the value', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const btn = screen.getByRole('button', { name: /From/i });
    btn.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Escape}');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(native(container).value).toBe('ath-airport');
  });
});

describe('QuickBooking', () => {
  const labels = {
    form: 'Quick booking',
    from: 'From',
    to: 'To',
    hours: 'Hours',
    date: 'Date',
    time: 'Time',
    passengers: 'Passengers',
    submit: 'See prices',
    swap: 'Swap pick-up and drop-off',
    transfer: 'Transfer',
    hourly: 'By the hour',
    fewerHours: 'Fewer hours',
    moreHours: 'More hours',
  };

  it('swap exchanges from and to', async () => {
    const user = userEvent.setup();
    render(
      <QuickBooking
        zones={options.map((o) => ({ code: o.value, name: o.label }))}
        hourlyBounds={{ minHours: 3, maxHours: 12 }}
        labels={labels}
        defaultFrom="ath-airport"
        defaultTo="athens-centre"
      />,
    );
    expect(screen.getByRole('button', { name: /From/i }).textContent).toContain(
      'Athens International Airport (AIA)',
    );
    await user.click(screen.getByRole('button', { name: labels.swap }));
    expect(screen.getByRole('button', { name: /From/i }).textContent).toContain('Athens');
    expect(screen.getByRole('button', { name: /To/i }).textContent).toContain(
      'Athens International Airport (AIA)',
    );
  });

  it('switch changes To to Hours and the query string', async () => {
    const user = userEvent.setup();
    render(
      <QuickBooking
        zones={options.map((o) => ({ code: o.value, name: o.label }))}
        hourlyBounds={{ minHours: 4, maxHours: 12 }}
        labels={labels}
        defaultFrom="ath-airport"
        defaultTo="athens-centre"
      />,
    );
    const see = screen.getByRole('link', { name: labels.submit });
    expect(see.getAttribute('href')).toContain('type=transfer');
    expect(see.getAttribute('href')).toContain('to=athens-centre');
    await user.click(screen.getByRole('button', { name: labels.hourly }));
    expect(screen.queryByRole('button', { name: /To/i })).toBeNull();
    expect(screen.getByText('4')).toBeTruthy();
    expect(see.getAttribute('href')).toContain('type=hourly');
    expect(see.getAttribute('href')).toContain('hours=4');
    expect(see.getAttribute('href')).not.toContain('to=');
  });

  it('quickBookingQuery omits to for hourly and never sends prices', () => {
    const href = quickBookingQuery({
      type: 'hourly',
      from: 'ath-airport',
      to: 'athens-centre',
      hours: 5,
      date: '2026-11-17',
      time: '14:30',
      passengers: 2,
    });
    expect(href).toBe(
      '/book?type=hourly&from=ath-airport&hours=5&date=2026-11-17&time=14%3A30&passengers=2',
    );
    expect(href).not.toMatch(/price|amount|total/i);
  });

  it('route chip fills from and to', async () => {
    const user = userEvent.setup();
    render(
      <QuickBooking
        zones={options.map((o) => ({ code: o.value, name: o.label }))}
        hourlyBounds={{ minHours: 3, maxHours: 12 }}
        labels={{ ...labels, routesSuggest: 'Popular routes' }}
        routes={[
          {
            fromCode: 'athens-centre',
            toCode: 'piraeus-port',
            label: 'Athens → Piraeus',
          },
        ]}
        defaultFrom="ath-airport"
        defaultTo="athens-centre"
      />,
    );
    expect(screen.getByRole('link', { name: labels.submit }).getAttribute('href')).toContain(
      'from=ath-airport',
    );
    await user.click(screen.getByRole('button', { name: 'Athens → Piraeus' }));
    expect(screen.getByRole('button', { name: /From/i }).textContent).toContain('Athens');
    expect(screen.getByRole('button', { name: /To/i }).textContent).toContain('Piraeus port');
    const href = screen.getByRole('link', { name: labels.submit }).getAttribute('href') ?? '';
    expect(href).toContain('from=athens-centre');
    expect(href).toContain('to=piraeus-port');
  });
});
