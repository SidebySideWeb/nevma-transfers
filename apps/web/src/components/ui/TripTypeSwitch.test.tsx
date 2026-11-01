/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TripTypeSwitch } from './TripTypeSwitch';

afterEach(cleanup);

describe('TripTypeSwitch', () => {
  it('changing type calls onChange', async () => {
    const onChange = vi.fn();
    render(<TripTypeSwitch value="transfer" onChange={onChange} transferLabel="Transfer" hourlyLabel="By the hour" />);
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect((screen.getByRole('radio', { name: 'Transfer' }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByRole('radio', { name: 'By the hour' }));
    expect(onChange).toHaveBeenCalledWith('hourly');
  });
});
