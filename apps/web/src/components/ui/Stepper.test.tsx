/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Stepper } from './Stepper';

function Harness({ start }: { start: number }) {
  const [v, setV] = useState(start);
  return <Stepper id="hours" label="Hours" value={v} min={3} max={12} onChange={setV} />;
}

afterEach(cleanup);

describe('Stepper', () => {
  it('stops at min (3) and disables minus', async () => {
    render(<Harness start={4} />);
    const minus = screen.getByRole('button', { name: 'Decrease Hours' });
    await userEvent.click(minus);
    expect((screen.getByLabelText('Hours') as HTMLInputElement).value).toBe('3');
    expect((minus as HTMLButtonElement).disabled).toBe(true);
  });

  it('stops at max (12) and disables plus', async () => {
    render(<Harness start={11} />);
    const plus = screen.getByRole('button', { name: 'Increase Hours' });
    await userEvent.click(plus);
    expect((screen.getByLabelText('Hours') as HTMLInputElement).value).toBe('12');
    expect((plus as HTMLButtonElement).disabled).toBe(true);
  });

  it('clamps an out-of-range value', () => {
    render(<Harness start={99} />);
    expect((screen.getByLabelText('Hours') as HTMLInputElement).value).toBe('12');
  });
});
