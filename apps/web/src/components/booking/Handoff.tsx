import { useEffect } from 'react';
import type { BookingStrings } from './types';

type Props = {
  checkoutUrl: string;
  strings: BookingStrings;
};

export function Handoff({ checkoutUrl, strings }: Props) {
  useEffect(() => {
    const t = window.setTimeout(() => {
      window.location.assign(checkoutUrl);
    }, 600);
    return () => window.clearTimeout(t);
  }, [checkoutUrl]);

  return (
    <div className="card center stack handoff" role="status" aria-live="polite">
      <div className="row handoff-spin">
        <div className="spinner" aria-hidden="true" />
      </div>
      <h1 tabIndex={-1}>{strings['booking.handoff.title']}</h1>
      <p className="muted">{strings['booking.handoff.body']}</p>
      <p>
        <a className="btn btn-gold" href={checkoutUrl}>
          {strings['booking.handoff.fallback']}
        </a>
      </p>
    </div>
  );
}
