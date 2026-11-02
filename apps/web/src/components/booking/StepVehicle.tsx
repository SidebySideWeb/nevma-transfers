import { useEffect, useRef } from 'react';
import { formatEuroV2 } from './format';
import { fill, requestQuoteHref, routeLines } from './v2/journey';
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
  /** Creates the hold for the chosen vehicle. */
  onSelect: (classKey: string) => void;
  onBack: () => void;
};

type QuoteOption = QuoteData['options'][number];
const sellable = (o: QuoteOption) => o.available && o.baseCents != null;

/** The radio that is on: the customer's pick, else the prefilled class, else the first one that can be sold. */
export function defaultVehicleKey(
  quote: QuoteData,
  picked: string | null,
  preferred?: string | null,
): string | null {
  const ok = (k?: string | null) => (k && quote.options.some((o) => o.classKey === k && sellable(o)) ? k : null);
  return ok(picked) ?? ok(preferred) ?? quote.options.find(sellable)?.classKey ?? null;
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
}: Props) {
  const classByKey = new Map(options.classes.map((c) => [c.key, c]));
  const route = routeLines(strings, options, search);
  const selected = defaultVehicleKey(quote, pickedClassKey, preferredClassKey);
  const selectedName = (selected && classByKey.get(selected)?.name) || selected || '';
  const priced = quote.options.filter((o) => o.baseCents != null);
  const showContact = priced.length === 0;
  const hasNoPrice = quote.options.some((o) => o.reason === 'no_price');
  const rows = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (preferredClassKey && selected === preferredClassKey) rows.current.get(selected)?.focus();
  }, [preferredClassKey, quote.options]);

  const intro = fill(strings['booking.vehicle.intro'], { route: '\u0000' }).split('\u0000');

  const move = (from: string, step: 1 | -1) => {
    const keys = quote.options.filter(sellable).map((o) => o.classKey);
    const next = keys[(keys.indexOf(from) + step + keys.length) % keys.length];
    if (!next) return;
    onPick(next);
    rows.current.get(next)?.focus();
  };

  return (
    <div className="s8f7a6">
      {holdExpiredMessage && (
        <div className="notice notice-danger" role="status">
          <p>
            <strong>{strings['booking.hold.expired']}</strong>
          </p>
        </div>
      )}
      {formError && (
        <div className="notice notice-danger" role="alert">
          {formError}
        </div>
      )}

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
          <p className="s0a0a6">
            {intro[0]}
            <strong className="sd01f5">{route.text}</strong>
            {intro[1]}
          </p>
          <div className="sb2770" role="radiogroup" aria-label={strings['booking.vehicle.title']}>
            {quote.options.map((opt) => {
              const meta = classByKey.get(opt.classKey);
              const name = meta?.name ?? opt.classKey;
              const disabled = !sellable(opt);
              const on = opt.classKey === selected;
              const reason =
                opt.reason === 'no_price'
                  ? strings['error.no_price']
                  : strings['booking.vehicle.unavailable'];
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
                    <span className="sb53f1">{strings['booking.vehicle.priceNote']}</span>
                    <span className={`radio ${on ? 'sbdbb7' : 's26017'}`}>
                      <span className={on ? 's94d88' : 's0c8bc'} />
                    </span>
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
