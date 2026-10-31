import type { FormEvent } from 'react';
import { formatEuro } from './format';
import { HoldTimer } from './HoldTimer';
import type {
  BookingStrings,
  DetailsState,
  HoldData,
  OptionsData,
  SearchState,
} from './types';

type Props = {
  strings: BookingStrings;
  options: OptionsData;
  search: SearchState;
  hold: HoldData;
  details: DetailsState;
  selectedClassKey: string;
  serverSkewMs: number;
  errors: Record<string, string>;
  formError: string | null;
  busy: boolean;
  onChange: (patch: Partial<DetailsState>) => void;
  onSubmit: () => void;
  onBack: () => void;
  onHoldExpired: () => void;
};

export function StepDetails({
  strings,
  options,
  search,
  hold,
  details,
  selectedClassKey,
  serverSkewMs,
  errors,
  formError,
  busy,
  onChange,
  onSubmit,
  onBack,
  onHoldExpired,
}: Props) {
  const cls = options.classes.find((c) => c.key === selectedClassKey);
  const errorKeys = Object.keys(errors);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const toggleExtra = (code: string, checked: boolean) => {
    const next = checked
      ? [...details.extras, code]
      : details.extras.filter((c) => c !== code);
    onChange({ extras: next });
  };

  return (
    <>
      <h1 tabIndex={-1}>{strings['booking.details.title']}</h1>
      <HoldTimer
        expiresAt={hold.expiresAt}
        serverSkewMs={serverSkewMs}
        timerTemplate={strings['booking.hold.timer'] ?? '{minutes}'}
        warningText={strings['booking.hold.warning'] ?? ''}
        onExpired={onHoldExpired}
      />

      {(formError || errorKeys.length > 0) && (
        <div className="notice notice-danger" role="alert" tabIndex={-1} id="error-summary">
          <p>
            <strong>{strings['booking.errors.summary']}</strong>
          </p>
          {formError && <p>{formError}</p>}
          <ul>
            {errorKeys.map((k) => (
              <li key={k}>
                <a href={`#field-${k}`}>{errors[k]}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="stack" onSubmit={handleSubmit} noValidate>
        <section className="card stack" aria-labelledby="trip-h">
          <h2 id="trip-h">Trip</h2>
          <p className="muted">
            {cls?.name} · {search.type === 'transfer' ? `${search.fromZone} → ${search.toZone}` : `${search.hours} h`}{' '}
            · {search.pickupLocal} (Athens)
          </p>
          <div className="grid grid-2">
            <div className="field" id="field-pickupAddress">
              <label htmlFor="pa">{strings['booking.pickup.address']}</label>
              <input
                id="pa"
                className="input"
                autoComplete="street-address"
                value={details.pickupAddress}
                aria-invalid={Boolean(errors.pickupAddress)}
                onChange={(e) => onChange({ pickupAddress: e.target.value })}
                required
              />
            </div>
            {search.type === 'transfer' && (
              <div className="field" id="field-dropoffAddress">
                <label htmlFor="da">{strings['booking.dropoff.address']}</label>
                <input
                  id="da"
                  className="input"
                  value={details.dropoffAddress}
                  aria-invalid={Boolean(errors.dropoffAddress)}
                  onChange={(e) => onChange({ dropoffAddress: e.target.value })}
                  required
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="fl">{strings['booking.flight']}</label>
              <input
                id="fl"
                className="input"
                value={details.flightNumber}
                onChange={(e) => onChange({ flightNumber: e.target.value })}
              />
            </div>
          </div>
        </section>

        <section className="card stack" aria-labelledby="you-h">
          <h2 id="you-h">Contact</h2>
          <div className="grid grid-2">
            <div className="field" id="field-name">
              <label htmlFor="nm">{strings['booking.details.name']}</label>
              <input
                id="nm"
                className="input"
                autoComplete="name"
                value={details.name}
                aria-invalid={Boolean(errors.name)}
                onChange={(e) => onChange({ name: e.target.value })}
                required
              />
            </div>
            <div className="field" id="field-email">
              <label htmlFor="em">{strings['booking.details.email']}</label>
              <input
                id="em"
                className="input"
                type="email"
                autoComplete="email"
                value={details.email}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'em-err' : undefined}
                onChange={(e) => onChange({ email: e.target.value })}
                required
              />
              {errors.email && (
                <span className="error" id="em-err">
                  {errors.email}
                </span>
              )}
            </div>
            <div className="field" id="field-phone">
              <label htmlFor="ph">{strings['booking.details.phone']}</label>
              <input
                id="ph"
                className="input"
                type="tel"
                autoComplete="tel"
                value={details.phone}
                aria-invalid={Boolean(errors.phone)}
                onChange={(e) => onChange({ phone: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="nt">{strings['booking.details.notes']}</label>
            <textarea
              id="nt"
              className="input"
              value={details.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
            />
          </div>
        </section>

        <section className="card stack" aria-labelledby="ex-h">
          <h2 id="ex-h">{strings['booking.extras.title']}</h2>
          {options.extras.map((ex) => {
            const isVip = ex.code === 'vip-security';
            const label = isVip
              ? strings['booking.extras.vip']
              : ex.code === 'night-surcharge'
                ? strings['booking.extras.night']
                : ex.name;
            return (
              <label className="check" key={ex.code}>
                <input
                  type="checkbox"
                  checked={details.extras.includes(ex.code)}
                  aria-describedby={isVip ? 'vip-hint' : undefined}
                  onChange={(e) => toggleExtra(ex.code, e.target.checked)}
                />
                <span>
                  {isVip ? (
                    <>
                      <strong>{label}</strong>
                      <br />
                      <span className="muted" id="vip-hint">
                        {strings['booking.extras.vip.hint']}
                      </span>
                    </>
                  ) : (
                    label
                  )}
                </span>
                <span className="price">{formatEuro(ex.priceCents)}</span>
              </label>
            );
          })}
        </section>

        <section className="card stack" aria-labelledby="inv-h">
          <h2 id="inv-h" className="sr-only">
            Invoice
          </h2>
          <label className="check">
            <input
              type="checkbox"
              checked={details.needInvoice}
              onChange={(e) => onChange({ needInvoice: e.target.checked })}
            />
            <span>{strings['booking.invoice.toggle']}</span>
          </label>
          {details.needInvoice && (
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="co">{strings['booking.invoice.company']}</label>
                <input
                  id="co"
                  className="input"
                  value={details.invoiceCompany}
                  onChange={(e) => onChange({ invoiceCompany: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="vat">{strings['booking.invoice.vat']}</label>
                <input
                  id="vat"
                  className="input"
                  value={details.invoiceVat}
                  onChange={(e) => onChange({ invoiceVat: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="tax">{strings['booking.invoice.taxOffice']}</label>
                <input
                  id="tax"
                  className="input"
                  value={details.invoiceTaxOffice}
                  onChange={(e) => onChange({ invoiceTaxOffice: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="ad">{strings['booking.invoice.address']}</label>
                <input
                  id="ad"
                  className="input"
                  value={details.invoiceAddress}
                  onChange={(e) => onChange({ invoiceAddress: e.target.value })}
                  required
                />
              </div>
            </div>
          )}
        </section>

        <label className="check" id="field-consent">
          <input
            type="checkbox"
            checked={details.consent}
            aria-invalid={Boolean(errors.consent)}
            onChange={(e) => onChange({ consent: e.target.checked })}
            required
          />
          <span>{strings['booking.consent']}</span>
        </label>

        <div className="row between">
          <button type="button" className="btn btn-ghost" onClick={onBack} disabled={busy}>
            {strings['booking.back']}
          </button>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? strings['booking.loading'] : strings['booking.continue']}
          </button>
        </div>
      </form>
    </>
  );
}
