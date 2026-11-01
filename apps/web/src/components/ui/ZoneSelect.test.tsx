/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZoneSelect } from './ZoneSelect';

const options = [
  { value: 'athens', label: 'Athens centre' },
  { value: 'airport', label: 'Athens airport' },
  { value: 'piraeus', label: 'Piraeus port' },
];

function Harness({ onSwap }: { onSwap?: () => void }) {
  const [v, setV] = useState('athens');
  return (
    <ZoneSelect
      id="pick"
      name="pickup"
      label="Pick-up area"
      options={options}
      value={v}
      onChange={setV}
      swapWith={onSwap ? { otherValue: 'airport', onSwap } : undefined}
    />
  );
}

const native = (c: HTMLElement) => c.querySelector('select') as HTMLSelectElement;

afterEach(cleanup);

describe('ZoneSelect', () => {
  it('keyboard pick updates the hidden select value', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const btn = screen.getByRole('combobox', { name: 'Pick-up area' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.focus();
    await user.keyboard('{ArrowDown}');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.getAttribute('aria-activedescendant')).toBe('pick-opt-0');
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(native(container).value).toBe('piraeus');
    expect(btn.textContent).toBe('Piraeus port');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('Home and End move the active option', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const btn = screen.getByRole('combobox');
    btn.focus();
    await user.keyboard('{Enter}{End}');
    expect(btn.getAttribute('aria-activedescendant')).toBe('pick-opt-2');
    await user.keyboard('{Home}');
    expect(btn.getAttribute('aria-activedescendant')).toBe('pick-opt-0');
  });

  it('Escape closes without changing the value', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const btn = screen.getByRole('combobox');
    btn.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Escape}');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(native(container).value).toBe('athens');
  });

  it('type-ahead moves to the matching option', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const btn = screen.getByRole('combobox');
    btn.focus();
    await user.keyboard('{ArrowDown}pi{Enter}');
    expect(native(container).value).toBe('piraeus');
  });

  it('swap button calls onSwap', async () => {
    const onSwap = vi.fn();
    render(<Harness onSwap={onSwap} />);
    await userEvent.click(screen.getByRole('button', { name: 'Swap pick-up and drop-off' }));
    expect(onSwap).toHaveBeenCalledOnce();
  });
});
