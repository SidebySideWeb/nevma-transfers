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
  onSelect: (classKey: string) => void;
  onChangeSearch: () => void;
};

export function StepVehicle({
  strings,
  options,
  search,
  quote,
  contact,
  busy,
  holdExpiredMessage,
  formError,
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

  return (
    <>
      <h1 tabIndex={-1}>{strings['booking.vehicle.title']}</h1>
      {holdExpiredMessage && (
        <p className="notice notice-danger" role="status">
          {strings['booking.hold.expired']}
        </p>
      )}
      {formError && (
        <p className="notice notice-danger" role="alert">
          {formError}
        </p>
      )}
      <p className="muted">
        {summary} · {quote.pickupAt} (Athens) · {search.passengers} passengers ·{' '}
        <button type="button" className="btn btn-ghost" onClick={onChangeSearch}>
          {strings['booking.change']}
        </button>
      </p>

      {showContact ? (
        <div className="notice">
          <p>{strings['booking.contactUs']}</p>
          <div className="row">
            <a className="btn btn-ghost" href={`tel:${contact.phone.replace(/\s/g, '')}`}>
              {contact.phone}
            </a>
            <a className="btn btn-ghost" href={`mailto:${contact.email}`}>
              {contact.email}
            </a>
          </div>
        </div>
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
            return (
              <article
                key={opt.classKey}
                className="card vehicle"
                aria-disabled={unavailable || undefined}
              >
                <div
                  className="photo"
                  role="img"
                  aria-label={meta?.photo?.alt ?? name}
                  style={
                    meta?.photo?.url
                      ? {
                          backgroundImage: `url(${meta.photo.url})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }
                      : undefined
                  }
                >
                  {!meta?.photo?.url && 'photo'}
                </div>
                <div className="stack">
                  <div>
                    <h2>{name}</h2>
                    <p className="muted">
                      {[
                        meta?.tagline,
                        meta
                          ? strings['booking.vehicle.capacity']
                              ?.replace('{passengers}', String(meta.maxPassengers))
                              .replace('{luggage}', String(meta.maxLuggage))
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="meta">
                    {opt.baseCents != null ? (
                      <span className="price">{formatEuro(opt.baseCents)}</span>
                    ) : (
                      <span className="badge badge-warning">{strings['error.no_price']}</span>
                    )}
                    {unavailable ? (
                      <span className="muted">{reason}</span>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => onSelect(opt.classKey)}
                      >
                        {busy ? strings['booking.loading'] : strings['booking.vehicle.select']}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
