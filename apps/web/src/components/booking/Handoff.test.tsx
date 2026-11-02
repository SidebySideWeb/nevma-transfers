/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Handoff } from './Handoff';

const strings = {
  'booking.handoff.title': 'Taking you to *Viva*',
  'booking.handoff.eyebrow': 'Secure payment',
  'booking.handoff.body': 'You will pay {total} on Viva’s secure page.',
  'booking.handoff.fallback': 'Continue to payment',
  'booking.handoff.back': 'Back to review',
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Host({ onBack = vi.fn(), startOpen = true }: { onBack?: () => void; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Pay €223.20 securely
      </button>
      <a href="/behind">Behind the dialog</a>
      {open && (
        <Handoff
          checkoutUrl="https://demo.vivapayments.com/web/checkout?ref=1"
          total="€223.20"
          strings={strings}
          redirectAfterMs={60_000}
          onBack={() => {
            onBack();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

describe('Handoff modal', () => {
  it('AC-19 is a modal dialog named after the heading, with the total filled in and no prototype buttons', () => {
    render(<Host />);
    const dialog = screen.getByRole('dialog', { name: 'Taking you to Viva' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Taking you to Viva' })).toBeTruthy();
    expect(dialog.textContent).toContain('You will pay €223.20 on Viva’s secure page.');
    expect(screen.queryByText(/Prototype/i)).toBeNull();
    expect(screen.queryByText(/Payment succeeds|Payment fails/i)).toBeNull();
    expect(screen.getByRole('link', { name: 'Continue to payment' }).getAttribute('href')).toContain(
      'vivapayments',
    );
  });

  it('AC-19 moves focus into the dialog and keeps Tab and Shift+Tab inside it', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);

    const link = screen.getByRole('link', { name: 'Continue to payment' });
    const back = screen.getByRole('button', { name: 'Back to review' });

    await user.tab();
    expect(document.activeElement).toBe(link);
    await user.tab();
    expect(document.activeElement).toBe(back);
    await user.tab(); // past the last control: wraps to the first, never to the page behind
    expect(document.activeElement).toBe(link);
    await user.tab({ shift: true }); // before the first control: wraps to the last
    expect(document.activeElement).toBe(back);
    expect(screen.getByRole('link', { name: 'Behind the dialog', hidden: true })).not.toBe(
      document.activeElement,
    );
  });

  it('AC-19 Escape and Back to review close it and return focus to Pay', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<Host onBack={onBack} startOpen={false} />);
    const pay = screen.getByRole('button', { name: /Pay €223.20 securely/ });
    await user.click(pay);
    expect(screen.getByRole('dialog')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('dialog')));

    await user.keyboard('{Escape}');
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(pay);

    await user.click(pay);
    await user.click(screen.getByRole('button', { name: 'Back to review' }));
    expect(onBack).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(pay);
  });

  it('sends the browser to Viva after the short interstitial, and not after Back to review', () => {
    vi.useFakeTimers();
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign },
    });
    try {
      const onBack = vi.fn();
      const { unmount } = render(
        <Handoff
          checkoutUrl="https://demo.vivapayments.com/x"
          total="€1.00"
          strings={strings}
          redirectAfterMs={600}
          onBack={onBack}
        />,
      );
      act(() => {
        vi.advanceTimersByTime(599);
      });
      expect(assign).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(assign).toHaveBeenCalledWith('https://demo.vivapayments.com/x');

      assign.mockClear();
      unmount();
      const second = render(
        <Handoff
          checkoutUrl="https://demo.vivapayments.com/y"
          total="€1.00"
          strings={strings}
          redirectAfterMs={600}
          onBack={onBack}
        />,
      );
      second.unmount(); // what "Back to review" does: the step changes and the dialog unmounts
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(assign).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });
});
