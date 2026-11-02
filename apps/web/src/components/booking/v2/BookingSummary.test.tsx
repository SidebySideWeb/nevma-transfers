/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BookingSummary, type BookingSummaryProps } from './BookingSummary';

const base: BookingSummaryProps = {
  step: 'details',
  ariaLabel: 'Booking summary',
  vehicle: { eyebrow: 'Luxury van', name: 'V-Class', photoUrl: '/v.jpg' },
  routeLabel: 'Route',
  route: { from: 'Athens International Airport (AIA)', to: 'Athens' },
  rows: [
    { label: 'Date & time', value: 'Tue 17 Nov 2026, 14:30' },
    { label: 'Passengers · luggage', value: '2 · 2' },
  ],
  lines: [{ label: 'V-Class transfer', value: '€223.20' }],
  total: { label: 'Total', value: '€223.20' },
  analysis: {
    title: 'Price analysis',
    net: { label: 'Price before VAT', value: '€180.00' },
    vat: { label: 'VAT 24%', value: '€43.20' },
    total: { label: 'Total', value: '€223.20' },
  },
  notes: ['Final price per vehicle, VAT included.'],
  help: { label: 'Need help?', phone: '+30 210 970 6967', href: 'tel:+302109706967' },
};

afterEach(cleanup);

describe('BookingSummary price analysis', () => {
  it.each(['search', 'vehicle', 'details'] as const)(
    'AC-37 step %s shows the total and the price note, never the VAT share',
    (step) => {
      render(<BookingSummary {...base} step={step} />);
      expect(screen.getByText('Total')).toBeTruthy();
      expect(screen.getAllByText('€223.20').length).toBeGreaterThan(0);
      expect(screen.getByText('Final price per vehicle, VAT included.')).toBeTruthy();
      expect(screen.queryByTestId('review-vat')).toBeNull();
      expect(screen.queryByTestId('review-net')).toBeNull();
      expect(screen.queryByText(/VAT 24%/)).toBeNull();
      expect(screen.queryByRole('heading', { name: /Price analysis/i })).toBeNull();
    },
  );

  it('AC-37 the review step adds the price analysis with the server values', () => {
    render(<BookingSummary {...base} step="review" />);
    expect(screen.getByRole('heading', { level: 2, name: /Price analysis/i })).toBeTruthy();
    expect(screen.getByTestId('review-net').textContent).toBe('€180.00');
    expect(screen.getByTestId('review-vat').textContent).toBe('€43.20');
    expect(screen.getByTestId('review-total').textContent).toBe('€223.20');
  });

  it('uses the design aside: photo, route arrow, rows, help phone link', () => {
    const { container } = render(<BookingSummary {...base} />);
    const aside = screen.getByRole('complementary', { name: 'Booking summary' });
    expect(aside.className).toBe('s18a95');
    expect(container.querySelector('img.sc22be')?.getAttribute('src')).toBe('/v.jpg');
    expect(container.querySelector('.sbbc0f')?.textContent).toBe('↓');
    expect(screen.getByRole('link', { name: '+30 210 970 6967' }).getAttribute('href')).toBe(
      'tel:+302109706967',
    );
  });

  it('hourly hire has no arrow and no drop-off, only the second route line', () => {
    const { container } = render(
      <BookingSummary {...base} route={{ from: 'Athens', to: 'By the hour · 4 hours', arrow: false }} />,
    );
    expect(screen.getByText('By the hour · 4 hours')).toBeTruthy();
    expect(container.querySelector('.sbbc0f')).toBeNull();
  });
});
