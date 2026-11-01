import { useEffect, useRef } from 'react';
import { Notice, VehicleCard } from '../ui';
import { formatEuro } from './format';
import type { BookingStrings, ContactInfo, OptionsData, QuoteData, SearchState } from './types';

type Props = {
  strings: BookingStrings;
  options: OptionsData;
  search: SearchState;
  quote: QuoteData;
  contact: ContactInfo;
  busy: boolean;
  holdExpiredMessage: boolean;
  formError: string | null;
  preferredClassKey?: string | null;
  onSelect: (classKey: string) => void;
  onChangeSearch: () => void;
};

function requestQuoteHref(search: SearchState, classKey?: string): string {
  const q = new URLSearchParams();
  if (search.fromZone) q.set('from', search.fromZone);
  if (search.type === 'transfer' && search.toZone) q.set('to', search.toZone);
  if (classKey) q.set('class', classKey);
  const qs = q.toString();
  return qs ? `/request-a-transfer?${qs}` : '/request-a-transfer';
}

export function StepVehicle({
  strings,
  options,
  search,
  quote,
  contact,
  busy,
  holdExpiredMessage,
  formError,
  preferredClassKey,
  onSelect,
  onChangeSearch,
}: Props) {
  const classByKey = new Map(options.classes.map((c) => [c.key, c]));
  const fromName = options.zones.find((z) => z.code === search.fromZone)?.name ?? search.fromZone;
  const toName = options.zones.find((z) => z.code === search.toZone)?.name ?? search.toZone;
  const summary =
    search.type === 'transfer'
      ? `${fromName} → ${toName}`
      : `${fromName} · ${search.hours} h`;

  const priced = quote.options.filter((o) => o.baseCents != null);
  const showContact = priced.length === 0;
  const preferredRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!preferredClassKey) return;
    preferredRef.current?.focus();
  }, [preferredClassKey, quote.options]);

  return (
    <>
      <h1 tabIndex={-1}>{strings['booking.vehicle.title']}</h1>
      {holdExpiredMessage && (
        <Notice tone="danger" role="status">
          {strings['booking.hold.expired']}
        </Notice>
      )}
      {formError && (
        <Notice tone="danger" role="alert">
          {formError}
        </Notice>
      )}
      <p className="muted">
        {summary} · {quote.pickupAt} (Athens) · {search.passengers} passengers ·{' '}
        <button type="button" className="btn btn-ghost" onClick={onChangeSearch}>
          {strings['booking.change']}
        </button>
      </p>

      {showContact ? (
        <Notice>
          <p>{strings['booking.contactUs']}</p>
          <div className="row">
            <a className="btn btn-ghost" href={`tel:${contact.phone.replace(/\s/g, '')}`}>
              {contact.phone}
            </a>
            <a className="btn btn-ghost" href={`mailto:${contact.email}`}>
              {contact.email}
            </a>
            <a className="btn btn-gold" href={requestQuoteHref(search)}>
              {strings['site.requestQuote'] ?? 'Request a quote'}
            </a>
          </div>
        </Notice>
      ) : (
        <div className="stack">
          {quote.options.map((opt) => {
            const meta = classByKey.get(opt.classKey);
            const name = meta?.name ?? opt.classKey;
            const unavailable = !opt.available || opt.baseCents == null;
            const reason =
              opt.reason === 'no_price'
                ? strings['error.no_price']
                : strings['error.unavailable'];
            const preferred = preferredClassKey === opt.classKey;
            return (
              <VehicleCard
                key={opt.classKey}
                name={name}
                kind={meta?.tagline || undefined}
                detail={
                  meta
                    ? strings['booking.vehicle.capacity']
                        ?.replace('{passengers}', String(meta.maxPassengers))
                        .replace('{luggage}', String(meta.maxLuggage))
                    : undefined
                }
                photoUrl={meta?.photo?.url}
                photoAlt={meta?.photo?.alt ?? name}
                disabled={unavailable}
                price={
                  opt.baseCents != null ? (
                    formatEuro(opt.baseCents)
                  ) : (
                    <span className="badge badge-warning">{strings['error.no_price']}</span>
                  )
                }
                status={
                  unavailable ? (
                    <span className="muted">
                      {reason}
                      {opt.reason === 'no_price' ? (
                        <>
                          {' · '}
                          <a href={requestQuoteHref(search, opt.classKey)}>
                            {strings['site.requestQuote'] ?? 'Request a quote'}
                          </a>
                        </>
                      ) : null}
                    </span>
                  ) : undefined
                }
                action={
                  unavailable ? undefined : (
                    <button
                      type="button"
                      className="btn btn-gold"
                      disabled={busy}
                      ref={preferred ? preferredRef : undefined}
                      aria-current={preferred ? 'true' : undefined}
                      onClick={() => onSelect(opt.classKey)}
                    >
                      {busy ? strings['booking.loading'] : strings['booking.vehicle.select']}
                    </button>
                  )
                }
              />
            );
          })}
        </div>
      )}
    </>
  );
}
