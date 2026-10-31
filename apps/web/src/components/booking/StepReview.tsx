import { formatEuro } from './format';
import { HoldTimer } from './HoldTimer';
import type { BookingData, BookingStrings } from './types';

type Props = {
  strings: BookingStrings;
  booking: BookingData;
  serverSkewMs: number;
  busy: boolean;
  formError: string | null;
  onPay: () => void;
  onHoldExpired: () => void;
};

export function StepReview({
  strings,
  booking,
  serverSkewMs,
  busy,
  formError,
  onPay,
  onHoldExpired,
}: Props) {
  return (
    <>
      <h1 tabIndex={-1}>{strings['booking.review.title']}</h1>
      <HoldTimer
        expiresAt={booking.holdExpiresAt}
        serverSkewMs={serverSkewMs}
        timerTemplate={strings['booking.hold.timer'] ?? '{minutes}'}
        warningText={strings['booking.hold.warning'] ?? ''}
        onExpired={onHoldExpired}
      />
      {formError && (
        <p className="notice notice-danger" role="alert">
          {formError}
        </p>
      )}
      <section className="card stack">
        <p className="eyebrow">Booking {booking.reference}</p>
        <dl className="summary">
          {booking.lines.map((line) => (
            <div key={`${line.label}-${line.cents}`}>
              <dt>{line.label}</dt>
              <dd>{formatEuro(line.cents)}</dd>
            </div>
          ))}
        </dl>
        <p className="total">
          <span>{strings['booking.total']}</span>
          <span>{formatEuro(booking.totalCents)}</span>
        </p>
        <button className="btn btn-block" type="button" disabled={busy} onClick={onPay}>
          {busy ? strings['booking.loading'] : strings['booking.pay']}
        </button>
      </section>
    </>
  );
}
