import { useEffect, useRef, type KeyboardEvent } from 'react';
import { fill } from './v2/journey';
import type { BookingStrings } from './types';

type Props = {
  checkoutUrl: string;
  /** Formatted total, e.g. "€223.20". */
  total: string;
  strings: BookingStrings;
  /** "Back to review" and Escape. The redirect timer stops when this component unmounts. */
  onBack: () => void;
  /** Where the browser goes after the short interstitial. */
  redirectAfterMs?: number;
};

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * `08-book-4-viva` without the prototype outcome buttons: a modal over the review page while the
 * browser is sent to Viva. Focus moves into the dialog, Tab stays inside it, and it returns on close.
 */
export function Handoff({ checkoutUrl, total, strings, onBack, redirectAfterMs = 600 }: Props) {
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      window.location.assign(checkoutUrl);
    }, redirectAfterMs);
    return () => window.clearTimeout(t);
  }, [checkoutUrl, redirectAfterMs]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => before?.focus?.();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onBack();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialog.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    } else if (!dialog.current?.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  };

  const [before = '', accent = '', after = ''] = (strings['booking.handoff.title'] ?? '').split(/\*([^*]+)\*/);

  return (
    <div
      className="s3d21d"
      role="dialog"
      aria-modal="true"
      aria-label={strings['booking.handoff.title']?.replace(/\*/g, '')}
      ref={dialog}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="s0e022">
        <span aria-hidden="true" className="spin" />
        <div className="eyebrow">{strings['booking.handoff.eyebrow']}</div>
        <h2 className="display se47a0">
          {before}
          {accent ? <em>{accent}</em> : null}
          {after}
        </h2>
        <p className="s0a0a6">{fill(strings['booking.handoff.body'], { total })}</p>
        <div className="s3920e" />
        <a className="btn btn-gold" href={checkoutUrl}>
          {strings['booking.handoff.fallback']}
        </a>
        <button type="button" className="editbtn s07c6a" onClick={onBack}>
          {strings['booking.handoff.back']}
        </button>
      </div>
    </div>
  );
}
