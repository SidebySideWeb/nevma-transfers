import { useEffect, useRef, useState } from 'react';
import { hourlyDurationLabel } from '../../lib/booking/hourly-labels';
import { formatEuroV2 } from './format';
import { fill, formatWhen, requestQuoteHref, routeLines } from './v2/journey';
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
  /** Radio choice (kept by BookingApp so the summary can follow it). */
  pickedClassKey: string | null;
  onPick: (classKey: string) => void;
  /** Creates the hold for the chosen vehicle, or advances on a signed quote. */
  onSelect: (classKey: string) => void;
  onBack: () => void;
  /** Re-quote when the signed quote TTL ends. */
  onRefreshQuote?: () => void;
  onQuoteExpired?: () => void;
  pricesUpdated?: boolean;
};

type QuoteOption = QuoteData['options'][number];
const sellable = (o: QuoteOption) => o.available && o.baseCents != null && o.reason !== 'not_priced';
const visible = (o: QuoteOption) => o.reason !== 'not_priced' && o.reason !== 'no_price';

/** The radio that is on: the customer's pick, else the prefilled class, else the first one that can be sold. */
export function defaultVehicleKey(
  quote: QuoteData,
  picked: string | null,
  preferred?: string | null,
): string | null {
  const ok = (k?: string | null) => (k && quote.options.some((o) => o.classKey === k && sellable(o)) ? k : null);
  return ok(picked) ?? ok(preferred) ?? quote.options.find(sellable)?.classKey ?? null;
}

function formatKmMin(distanceKm: number | null | undefined, durationMin: number | undefined): string | null {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return null;
  const mins = durationMin ?? 0;
  return `${distanceKm.toFixed(1)} km · approx. ${mins} min`;
}

function QuoteTimer({
  expiresAt,
  strings,
  onExpired,
}: {
  expiresAt: string;
  strings: BookingStrings;
  onExpired: () => void;
}) {
  const [leftMs, setLeftMs] = useState(() => Date.parse(expiresAt) - Date.now());
  useEffect(() => {
    const tick = () => {
      const ms = Date.parse(expiresAt) - Date.now();
      setLeftMs(ms);
      if (ms <= 0) onExpired();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt, onExpired]);

  if (leftMs > 3 * 60_000 || leftMs <= 0) return null;
  const totalSec = Math.max(0, Math.ceil(leftMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = String(totalSec % 60).padStart(2, '0');
  const label = (strings['booking.quote.held'] ?? 'Prices held for {time}').replace(
    '{time}',
    `${m}:${s}`,
  );
  return (
    <p className="ep-quote-timer" role="status">
      {label}
    </p>
  );
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
  pickedClassKey,
  onPick,
  onSelect,
  onBack,
  onRefreshQuote,
  onQuoteExpired,
  pricesUpdated = false,
}: Props) {
  const classByKey = new Map(options.classes.map((c) => [c.key, c]));
  const route = routeLines(strings, options, search);
  const selected = defaultVehicleKey(quote, pickedClassKey, preferredClassKey);
  const selectedName = (selected && classByKey.get(selected)?.name) || selected || '';
  const shown = quote.options.filter(visible);
  const priced = shown.filter((o) => o.baseCents != null);
  const showContact = priced.length === 0;
  const hasNoPrice = quote.options.some((o) => o.reason === 'no_price');
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const when = formatWhen(search.pickupLocal);
  const waitMin = options.waitingAirportFreeMin ?? 60;
  const kmPerHour = options.kmPerHour ?? 40;
  const distLine =
    search.type === 'hourly'
      ? hourlyDurationLabel(search.hours, kmPerHour)
      : formatKmMin(quote.distanceKm, quote.durationMin ?? quote.durationMinutes);
  const priceIncludes = (
    strings['booking.vehicle.priceIncludes'] ??
    'Price includes VAT, tolls and {minutes} min free waiting at airports'
  ).replace('{minutes}', String(waitMin));

  useEffect(() => {
    if (preferredClassKey && selected === preferredClassKey) rows.current.get(selected)?.focus();
  }, [preferredClassKey, quote.options]);

  const move = (from: string, step: 1 | -1) => {
    const keys = shown.filter(sellable).map((o) => o.classKey);
    const next = keys[(keys.indexOf(from) + step + keys.length) % keys.length];
    if (!next) return;
    onPick(next);
    rows.current.get(next)?.focus();
  };

  return (
    <div className="s8f7a6">
      {holdExpiredMessage && onRefreshQuote && (
        <div className="notice notice-danger" role="status">
          <p>
            <strong>{strings['booking.quote.expired'] ?? strings['booking.hold.expired']}</strong>
          </p>
          <button type="button" className="btn btn-gold" onClick={onRefreshQuote} disabled={busy}>
            {strings['booking.quote.refresh'] ?? 'Prices updated'}
          </button>
        </div>
      )}
      {pricesUpdated ? (
        <p className="ep-quote-updated" role="status">
          {strings['booking.quote.updated'] ?? 'Prices updated'}
        </p>
      ) : null}
      {formError && (
        <div className="notice notice-danger" role="alert">
          {formError}
        </div>
      )}

      <div className="ep-route-card" data-v2-extra>
        <div className="ep-route-main">
          <p className="ep-route-fromto">
            <strong>{route.from}</strong>
            {route.to ? (
              <>
                {' '}
                <span className="sbbc0f" aria-hidden="true">
                  →
                </span>{' '}
                <strong>{route.to}</strong>
              </>
            ) : (
              <>
                {' '}
                · {route.second}
              </>
            )}
          </p>
          {when ? (
            <p className="ep-route-when">
              {when.date}, {when.time}{' '}
              <span className="js-hint">({strings['booking.athensHint'] ?? 'Athens time'})</span>
            </p>
          ) : null}
          {distLine ? <p className="ep-route-meta">{distLine}</p> : null}
        </div>
        <button type="button" className="sd347e" onClick={onBack}>
          {strings['booking.edit'] ?? 'Edit'}
        </button>
      </div>

      {quote.expiresAt && onQuoteExpired ? (
        <QuoteTimer expiresAt={quote.expiresAt} strings={strings} onExpired={onQuoteExpired} />
      ) : null}

      {showContact ? (
        <>
          <p className="s0a0a6">{strings['booking.contactUs']}</p>
          <div className="s8dac8">
            <a className="btn btn-line" href={`tel:${contact.phone.replace(/\s/g, '')}`}>
              {contact.phone}
            </a>
            <a className="btn btn-line" href={`mailto:${contact.email}`}>
              {contact.email}
            </a>
            <a className="btn btn-gold" href={requestQuoteHref(search)}>
              {strings['site.requestQuote']}
            </a>
          </div>
        </>
      ) : (
        <>
          <div className="sb2770" role="radiogroup" aria-label={strings['booking.vehicle.title']}>
            {shown.map((opt) => {
              const meta = classByKey.get(opt.classKey);
              const name = meta?.name ?? opt.classKey;
              const disabled = !sellable(opt);
              const on = opt.classKey === selected;
              const reason = strings['booking.vehicle.unavailable'] ?? 'Not available at this time';
              return (
                <button
                  key={opt.classKey}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-disabled={disabled}
                  tabIndex={on ? 0 : -1}
                  className={`vrow ${disabled ? 'sb9ce2' : on ? 's667af' : 'sfee0d'}`}
                  ref={(el) => {
                    if (el) rows.current.set(opt.classKey, el);
                    else rows.current.delete(opt.classKey);
                  }}
                  onClick={() => !disabled && onPick(opt.classKey)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                      e.preventDefault();
                      move(opt.classKey, 1);
                    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                      e.preventDefault();
                      move(opt.classKey, -1);
                    }
                  }}
                >
                  <span className="sdaacc">
                    {meta?.photo?.url ? <img className="sc22be" src={meta.photo.url} alt="" /> : null}
                  </span>
                  <span className="safecf">
                    <span className="s7864d">{meta?.tagline}</span>
                    <span className="display s87b2d">{name}</span>
                    <span className="s8ad2a">
                      {meta
                        ? fill(strings['booking.vehicle.seatsBags'], {
                            passengers: meta.maxPassengers,
                            luggage: meta.maxLuggage,
                          })
                        : null}
                      {' · '}
                      <span className={disabled ? 's0a350' : 'sbbc0f'}>
                        {disabled ? reason : strings['booking.vehicle.available']}
                      </span>
                    </span>
                  </span>
                  <span className="s893bf">
                    <span className="s7244a">
                      {opt.baseCents != null ? formatEuroV2(opt.baseCents) : '—'}
                    </span>
                    {opt.outbound != null && opt.return != null ? (
                      <span className="ep-return-split muted small">
                        {(
                          strings['booking.return.split'] ??
                          'Outbound {out} + Return {ret} = {total}'
                        )
                          .replace('{out}', formatEuroV2(opt.outbound))
                          .replace('{ret}', formatEuroV2(opt.return))
                          .replace('{total}', formatEuroV2(opt.total ?? opt.baseCents ?? 0))}
                        {opt.returnDiscountPct && opt.returnDiscountPct > 0
                          ? ` · ${(strings['booking.return.discount'] ?? 'Return discount −{pct} %').replace('{pct}', String(opt.returnDiscountPct))}`
                          : ''}
                      </span>
                    ) : null}
                    <span className="sb53f1">{priceIncludes}</span>
                    <span className={`radio ${on ? 'sbdbb7' : 's26017'}`}>
                      <span className={on ? 's94d88' : 's0c8bc'} />
                    </span>
                    {!disabled ? (
                      <span className="ep-select-label" aria-hidden="true">
                        {strings['booking.vehicle.select'] ?? 'Select'}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
          {hasNoPrice && (
            <a className="sd347e" href={requestQuoteHref(search)}>
              {strings['site.requestQuote']}
            </a>
          )}
        </>
      )}

      <div className="s8dac8">
        <button type="button" className="btn btn-line" onClick={onBack} disabled={busy}>
          <span aria-hidden="true">←</span> {strings['booking.step.journey']}
        </button>
        {!showContact && (
          <button
            type="button"
            className="btn btn-gold sd0928"
            disabled={busy || !selected}
            onClick={() => selected && onSelect(selected)}
          >
            {busy ? (
              strings['booking.loading']
            ) : (
              <>
                {fill(strings['booking.vehicle.continue'], { vehicle: selectedName })}{' '}
                <span aria-hidden="true">→</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
