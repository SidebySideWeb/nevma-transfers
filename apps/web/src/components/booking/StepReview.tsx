import { formatVatRate } from '../../lib/booking/pricing';
import { Notice } from '../ui';
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
  const netCents = booking.totalCents - booking.vatCents;
  const rateLabel = formatVatRate(booking.vatRateBp);

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
        <Notice tone="danger" role="alert">
          {formError}
        </Notice>
      )}
      <section className="card stack pay-card">
        <p className="eyebrow">Booking {booking.reference}</p>
        <dl className="summary">
          {booking.lines.map((line) => (
            <div key={`${line.label}-${line.cents}`}>
              <dt>{line.label}</dt>
              <dd>{formatEuro(line.cents)}</dd>
            </div>
          ))}
        </dl>

        <section className="price-analysis stack" aria-labelledby="price-analysis-h">
          <h2 id="price-analysis-h" className="eyebrow">
            {strings['booking.review.priceAnalysis']}
          </h2>
          <dl className="summary">
            {booking.lines.map((line) => (
              <div key={`pa-${line.label}-${line.cents}`}>
                <dt>{line.label}</dt>
                <dd>{formatEuro(line.cents)}</dd>
              </div>
            ))}
            <div>
              <dt>{strings['booking.review.net']}</dt>
              <dd data-testid="review-net">{formatEuro(netCents)}</dd>
            </div>
            <div>
              <dt>
                {(strings['booking.review.vat'] ?? 'VAT {rate}%').replace('{rate}', rateLabel)}
              </dt>
              <dd data-testid="review-vat">{formatEuro(booking.vatCents)}</dd>
            </div>
            <div className="grand">
              <dt>{strings['booking.review.totalInclVat']}</dt>
              <dd data-testid="review-total">{formatEuro(booking.totalCents)}</dd>
            </div>
          </dl>
        </section>

        <p className="total">
          <span>{strings['booking.total']}</span>
          <span>{formatEuro(booking.totalCents)}</span>
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
          {strings['booking.priceNote']}
        </p>
        <button className="btn btn-gold btn-block" type="button" disabled={busy} onClick={onPay}>
          {busy ? strings['booking.loading'] : strings['booking.pay']}
        </button>
      </section>
    </>
  );
}
