/** @vitest-environment jsdom */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingHero, type BookingHeroProps } from './BookingHero';

const header: BookingHeroProps['header'] = {
  homeHref: '/',
  homeLabel: 'Elite Protection home',
  logoSrc: '/images/v2/logo-white.png',
  logoAlt: 'Elite Protection',
  navLabel: 'Main',
  nav: [{ href: '/fleet', label: 'Fleet' }],
  phone: '+30 210 970 6967',
  phoneHref: 'tel:+302109706967',
  bookHref: '/book',
  bookLabel: 'Book',
  menuLabel: 'Menu',
};

const base: BookingHeroProps = {
  header,
  step: 'details',
  title: 'Your details',
  stepLabels: ['Journey', 'Vehicle', 'Details', 'Payment'],
  stepsLabel: 'Booking steps',
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('BookingHero step indicator', () => {
  it('AC-19 finished steps go back, the current step has aria-current, later steps cannot be clicked', async () => {
    const user = userEvent.setup();
    const onGoStep = vi.fn();
    render(<BookingHero {...base} onGoStep={onGoStep} />);

    const items = within(screen.getByRole('list', { name: 'Booking steps' })).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('aria-current'))).toEqual(['false', 'false', 'step', 'false']);

    await user.click(screen.getByRole('button', { name: /Journey/ }));
    await user.click(screen.getByRole('button', { name: /Vehicle/ }));
    expect(onGoStep.mock.calls).toEqual([['search'], ['vehicle']]);

    const payment = screen.getByRole('button', { name: /Payment/ }) as HTMLButtonElement;
    expect(payment.disabled).toBe(true);
    await user.click(payment);
    expect(onGoStep).toHaveBeenCalledTimes(2);

    // Done steps carry the tick, the way 08-book-2 draws them.
    expect(screen.getByRole('button', { name: /Journey/ }).textContent).toBe('1.✓ Journey');
    expect(screen.getByRole('button', { name: /Details/ }).textContent).toBe('3.Details');
  });

  it('keeps the design markup: appHero block with the header and a heading that can take focus', () => {
    const { container } = render(<BookingHero {...base} step="search" title="Where and when?" />);
    const hero = container.querySelector('[data-block="appHero"]');
    expect(hero?.className).toBe('bgx1 s5e090');
    expect(hero?.querySelector('header[data-block="siteHeader"] .js-menu-open')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).getAttribute('tabindex')).toBe('-1');
    expect(container.querySelector('[role="timer"]')).toBeNull();
  });
});

describe('BookingHero hold badge', () => {
  const hold = (expiresAt: string) => ({
    expiresAt,
    serverSkewMs: 0,
    label: 'V-CLASS HELD FOR',
    timerLabel: 'Held for',
    announceTemplate: 'Your vehicle is held for {minutes} minutes.',
    warningText: 'Your hold ends in 2 minutes.',
    onExpired: vi.fn(),
  });

  it('AC-19 digits tick every second but the live region changes at most once a minute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-17T10:00:00Z'));
    const expiresAt = new Date(Date.now() + 330_000).toISOString(); // 5:30 left
    render(<BookingHero {...base} hold={hold(expiresAt)} />);

    const timer = screen.getByRole('timer', { name: 'Held for' });
    const live = screen.getByTestId('hold-live');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(timer.textContent).toContain('V-CLASS HELD FOR');
    expect(timer.textContent).toContain('05:30');
    const first = live.textContent;
    expect(first).toBe('Your vehicle is held for 6 minutes.');

    const seen = new Set<string>();
    const digits = new Set<string>();
    for (let i = 0; i < 29; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      seen.add(live.textContent ?? '');
      digits.add(timer.textContent ?? '');
    }
    expect([...seen]).toEqual([first]); // 29 s later: unchanged
    expect(digits.size).toBe(29); // the digits did move every second
    expect(timer.textContent).toContain('05:01');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(timer.textContent).toContain('05:00');
    expect(live.textContent).toBe('Your vehicle is held for 5 minutes.');
  });

  it('AC-19 warns once at 2 minutes and calls onExpired once at zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-17T10:00:00Z'));
    const h = hold(new Date(Date.now() + 125_000).toISOString());
    render(<BookingHero {...base} hold={h} />);
    const live = screen.getByTestId('hold-live');
    expect(live.textContent).toBe('Your vehicle is held for 3 minutes.');
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(live.textContent).toBe('Your hold ends in 2 minutes.');
    act(() => {
      vi.advanceTimersByTime(130_000);
    });
    expect(h.onExpired).toHaveBeenCalledTimes(1);
  });
});
