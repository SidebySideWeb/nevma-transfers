import type { ReactNode } from 'react';
import { formatEuroV2 } from './format';
import { fill, formatWhen, routeLines } from './v2/journey';
import type {
  BookingData,
  BookingStrings,
  DetailsState,
  OptionsData,
  SearchState,
} from './types';

export type ReviewTarget = 'search' | 'vehicle' | 'details';

type Props = {
  strings: BookingStrings;
  options: OptionsData;
  search: SearchState;
  details: DetailsState;
  classKey: string | null;
  booking: BookingData;
  busy: boolean;
  formError: string | null;
  onPay: () => void;
  /** Edit rows and "← Details": BookingApp releases the pending booking, then goes to this step. */
  onEdit: (target: ReviewTarget) => void;
  /** The hand-off modal, when it is open. */
  children?: ReactNode;
};

export function StepReview({
  strings,
  options,
  search,
  details,
  classKey,
  booking,
  busy,
  formError,
  onPay,
  onEdit,
  children,
}: Props) {
  const cls = options.classes.find((c) => c.key === classKey);
  const route = routeLines(strings, options, search);
  const when = formatWhen(search.pickupLocal);
  const total = formatEuroV2(booking.totalCents);
  const vip = details.extras.some((e) => e.code === 'vip-security');

  const rows: { label: string; main: string; sub: string; target: ReviewTarget }[] = [
    {
      label: strings['booking.review.journey'] ?? '',
      main: route.text,
      sub: fill(strings['booking.review.journeySub'], {
        date: when?.date ?? '',
        time: when?.time ?? '',
        passengers: search.passengers,
        luggage: search.luggage,
      }),
      target: 'search',
    },
    {
      label: strings['booking.review.vehicle'] ?? '',
      main: cls?.name ?? classKey ?? '',
      sub: (vip ? strings['booking.review.withEscort'] : strings['booking.review.noEscort']) ?? '',
      target: 'vehicle',
    },
    {
      label: strings['booking.review.lead'] ?? '',
      main: details.name,
      sub: `${details.email} · ${details.phone}`,
      target: 'details',
    },
    {
      label: strings['booking.review.invoice'] ?? '',
      main:
        (details.needInvoice
          ? strings['booking.review.invoiceRequested']
          : strings['booking.review.receiptOnly']) ?? '',
      sub:
        (details.needInvoice
          ? strings['booking.review.invoiceAfter']
          : strings['booking.review.receiptHint']) ?? '',
      target: 'details',
    },
  ];

  return (
    <div className="s8f7a6">
      {formError && (
        <div className="notice notice-danger" role="alert">
          {formError}
        </div>
      )}

      <div className="sbafc3">
        {rows.map((r) => (
          <div className="s0df61" key={r.label}>
            <div>
              <div className="s36738">{r.label.toUpperCase()}</div>
              <div className="s276eb">{r.main}</div>
              <div className="s8ad2a">{r.sub}</div>
            </div>
            <button
              type="button"
              className="editbtn"
              disabled={busy}
              aria-label={`${strings['booking.review.edit']}: ${r.label}`}
              onClick={() => onEdit(r.target)}
            >
              {strings['booking.review.edit']}
            </button>
          </div>
        ))}
      </div>

      <div className="s711e1">
        <div className="eyebrow">{strings['booking.payBox.eyebrow']}</div>
        <h2 className="display se47a0">{fill(strings['booking.payBox.title'], { total })}</h2>
        <p className="s0a0a6">{strings['booking.payBox.body']}</p>
        <div className="s8dac8">
          <button type="button" className="btn btn-gold s1c986" disabled={busy} onClick={onPay}>
            {busy ? strings['booking.loading'] : fill(strings['booking.pay'], { total })}
          </button>
          <button type="button" className="btn btn-line" disabled={busy} onClick={() => onEdit('details')}>
            <span aria-hidden="true">←</span> {strings['booking.step.details']}
          </button>
        </div>
        <div className="sdc924">
          <span>{strings['booking.payBox.secured']}</span>
          <span>·</span>
          <span>{strings['booking.payBox.methods']}</span>
        </div>
      </div>

      {children}
    </div>
  );
}
