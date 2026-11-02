/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressField } from './AddressField';

const sug = {
  placeId: 'ChIJ8UNwBh-9oRQR3Y1mdkU1Nic',
  label: 'Hilton Athens, Athens',
  main: 'Hilton Athens',
  secondary: 'Athens, Greece',
};

describe('AddressField', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('autocomplete')) {
          return {
            ok: true,
            json: async () => ({ suggestions: [sug] }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            placeId: sug.placeId,
            address: sug.label,
            lat: 37.9767,
            lng: 23.7503,
          }),
        };
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('debounces and needs 3 letters; keyboard picks and clears place on edit', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <AddressField
        id="b-pick"
        label="Pick-up"
        name="pickupAddress"
        placePrefix="pickup"
        value=""
        place={null}
        enabled
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('Pick-up');
    await user.type(input, 'hi');
    await new Promise((r) => setTimeout(r, 350));
    expect(fetch).not.toHaveBeenCalled();

    rerender(
      <AddressField
        id="b-pick"
        label="Pick-up"
        name="pickupAddress"
        placePrefix="pickup"
        value="hilton ath"
        place={null}
        enabled
        onChange={onChange}
      />,
    );
    await waitFor(() => expect(screen.getByRole('listbox')).toBeTruthy(), { timeout: 1000 });
    expect(screen.getByRole('option').getAttribute('id')).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText('Pick-up'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByLabelText('Pick-up'), { key: 'Enter' });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ placeId: sug.placeId, lat: 37.9767 }),
      ),
    );

    const afterPick = onChange.mock.calls.at(-1)![1];
    onChange.mockClear();
    rerender(
      <AddressField
        id="b-pick"
        label="Pick-up"
        name="pickupAddress"
        placePrefix="pickup"
        value="Hilton Athens"
        place={afterPick}
        enabled
        onChange={onChange}
      />,
    );
    await user.type(screen.getByLabelText('Pick-up'), 'x');
    expect(onChange).toHaveBeenCalledWith(expect.any(String), null);
  });
});
