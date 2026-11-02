import { useId, type FormEvent, type ReactNode } from 'react';
import { formatEuroV2 } from './format';
import type { BookingStrings, DetailsState, OptionsData, SearchState } from './types';

type Props = {
  strings: BookingStrings;
  options: OptionsData;
  search: SearchState;
  details: DetailsState;
  errors: Record<string, string>;
  formError: string | null;
  busy: boolean;
  onChange: (patch: Partial<DetailsState>) => void;
  onSubmit: () => void;
  onBack: () => void;
};

/** Error summary links go to the control with the problem; keys without a control on this step stay plain text. */
const FIELD_ID: Record<string, string> = {
  name: 'b-name',
  email: 'b-email',
  phone: 'b-phone',
  consent: 'b-consent',
  company: 'b-co',
  vat: 'b-vat',
  taxOffice: 'b-tax',
  address: 'b-addr',
};

type AddonProps = {
  id: string;
  on: boolean;
  title: string;
  hint?: string;
  eyebrow?: string;
  price: string;
  photo?: boolean;
  disabled?: boolean;
  onToggle: (on: boolean) => void;
};

/** `addon` button of 08-book-3 (role=switch): on = `sbdbb7` / `s94d88` / `sba1a6`, off = `s651d2` / `s0c8bc` / `s3d884`. */
function Addon({ id, on, title, hint, eyebrow, price, photo, disabled, onToggle }: AddonProps) {
  const titleId = `${id}-title`;
  const hintId = `${id}-hint`;
  return (
    <button
      type="button"
      id={id}
      className={`addon ${on ? 'sbdbb7' : 's651d2'}`}
      role="switch"
      aria-checked={on}
      aria-labelledby={titleId}
      aria-describedby={hint ? hintId : undefined}
      disabled={disabled}
      onClick={() => onToggle(!on)}
    >
      {photo ? <span className="bgx2 s28753" /> : null}
      <span className="sc7788">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <span className="sa1394" id={titleId}>
          {title}
        </span>
        {hint ? (
          <span className="sf0124" id={hintId}>
            {hint}
          </span>
        ) : null}
      </span>
      <span className="s6737f">
        <span className="sfd829">+ {price}</span>
        <span className={`switch ${on ? 's94d88' : 's0c8bc'}`}>
          <span className={on ? 'sba1a6' : 's3d884'} />
        </span>
      </span>
    </button>
  );
}

export function StepDetails({
  strings,
  options,
  search,
  details,
  errors,
  formError,
  busy,
  onChange,
  onSubmit,
  onBack,
}: Props) {
  const uid = useId();
  const invoiceId = `${uid}-invoice`;
  const errorKeys = Object.keys(errors);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const extraQty = (code: string) => details.extras.find((e) => e.code === code)?.quantity ?? 0;

  const setExtraQty = (code: string, quantity: number) => {
    const rest = details.extras.filter((e) => e.code !== code);
    onChange({
      extras: quantity > 0 ? [...rest, { code, quantity }] : rest,
    });
  };

  const offeredExtras = options.extras.filter((ex) =>
    (ex.appliesTo ?? ['transfer', 'hourly']).includes(search.type),
  );

  const err = (k: string, id: string) =>
    errors[k] ? (
      <span className="error" id={`${id}-err`}>
        {errors[k]}
      </span>
    ) : null;
  const invalid = (k: string, id: string) => ({
    'aria-invalid': errors[k] ? (true as const) : undefined,
    'aria-describedby': errors[k] ? `${id}-err` : undefined,
  });

  const field = (
    k: keyof DetailsState & string,
    id: string,
    label: string | undefined,
    extra: { type?: string; autoComplete?: string; placeholder?: string } = {},
  ): ReactNode => (
    <div className="f2">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={extra.type ?? 'text'}
        autoComplete={extra.autoComplete}
        placeholder={extra.placeholder}
        value={String(details[k] ?? '')}
        onChange={(e) => onChange({ [k]: e.target.value })}
        {...invalid(k, id)}
      />
      {err(k, id)}
    </div>
  );

  return (
    <form className="s8f7a6" onSubmit={handleSubmit} noValidate>
      {(formError || errorKeys.length > 0) && (
        <div className="notice notice-danger" role="alert" tabIndex={-1} id="error-summary">
          <p>
            <strong>{strings['booking.errors.summary']}</strong>
          </p>
          {formError && <p>{formError}</p>}
          <ul>
            {errorKeys.map((k) => (
              <li key={k}>{FIELD_ID[k] ? <a href={`#${FIELD_ID[k]}`}>{errors[k]}</a> : errors[k]}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid">
        {field('name', 'b-name', strings['booking.details.name'], { autoComplete: 'name' })}
        {field('email', 'b-email', strings['booking.details.email'], {
          type: 'email',
          autoComplete: 'email',
        })}
        {field('phone', 'b-phone', strings['booking.details.phone'], {
          type: 'tel',
          autoComplete: 'tel',
          placeholder: strings['form.placeholder.phone'],
        })}
        {field('notes', 'b-notes', strings['booking.details.notes'])}
      </div>

      {offeredExtras.map((ex) => {
        const isVip = ex.code === 'vip-security';
        const maxQty = ex.maxQuantity ?? 1;
        const label = ex.code === 'night-surcharge' ? strings['booking.extras.night'] : ex.name;
        if (!isVip && maxQty > 1) {
          const qty = extraQty(ex.code);
          const lblId = `${uid}-${ex.code}`;
          return (
            <div className="f2" key={ex.code}>
              <span className="lbl" id={lblId}>
                {label} · {formatEuroV2(ex.priceCents)}
              </span>
              <div className="stepper" role="group" aria-labelledby={lblId}>
                <button
                  type="button"
                  aria-label={`${strings['form.stepper.fewer']} ${label}`}
                  disabled={qty <= 0 || busy}
                  onClick={() => setExtraQty(ex.code, Math.max(0, qty - 1))}
                >
                  −
                </button>
                <span>{qty}</span>
                <button
                  type="button"
                  aria-label={`${strings['form.stepper.more']} ${label}`}
                  disabled={qty >= maxQty || busy}
                  onClick={() => setExtraQty(ex.code, Math.min(maxQty, qty + 1))}
                >
                  +
                </button>
              </div>
            </div>
          );
        }
        return (
          <Addon
            key={ex.code}
            id={`extra-${ex.code}`}
            on={extraQty(ex.code) > 0}
            title={isVip ? (strings['booking.extras.vip'] ?? ex.name) : (label ?? ex.name)}
            hint={isVip ? strings['booking.extras.vip.hint'] : undefined}
            eyebrow={isVip ? strings['booking.extras.label'] : undefined}
            price={formatEuroV2(ex.priceCents)}
            photo={isVip}
            disabled={busy}
            onToggle={(on) => setExtraQty(ex.code, on ? 1 : 0)}
          />
        );
      })}

      <button
        type="button"
        className="disclose"
        aria-expanded={details.needInvoice}
        aria-controls={invoiceId}
        onClick={() => onChange({ needInvoice: !details.needInvoice })}
      >
        <span aria-hidden="true">{details.needInvoice ? '−' : '+'}</span>{' '}
        {strings['booking.invoice.toggle']}
      </button>
      {details.needInvoice && (
        <div className="grid s02d42" id={invoiceId}>
          {field('invoiceCompany', 'b-co', strings['booking.invoice.company'])}
          {field('invoiceVat', 'b-vat', strings['booking.invoice.vat'])}
          {field('invoiceTaxOffice', 'b-tax', strings['booking.invoice.taxOffice'])}
          {field('invoiceAddress', 'b-addr', strings['booking.invoice.address'])}
        </div>
      )}

      <label className="sb72c0">
        <input
          className="sd8619"
          type="checkbox"
          id="b-consent"
          checked={details.consent}
          onChange={(e) => onChange({ consent: e.target.checked })}
          {...invalid('consent', 'b-consent')}
        />
        <span>
          {(strings['booking.terms'] || strings['booking.consent'] || '')
            .split(/(\{terms\}|\{privacy\})/)
            .map((part, i) => {
              if (part === '{terms}') {
                return (
                  <a key={i} href="/legal#terms">
                    {strings['booking.terms.link'] || 'terms'}
                  </a>
                );
              }
              if (part === '{privacy}') {
                return (
                  <a key={i} href="/legal#privacy">
                    {strings['booking.privacy.link'] || 'privacy policy'}
                  </a>
                );
              }
              return <span key={i}>{part}</span>;
            })}
        </span>
      </label>
      {err('consent', 'b-consent')}

      <div className="s8dac8">
        <button type="button" className="btn btn-line" onClick={onBack} disabled={busy}>
          <span aria-hidden="true">←</span> {strings['booking.step.vehicle']}
        </button>
        <button className="btn btn-gold sd0928" type="submit" disabled={busy}>
          {busy ? (
            strings['booking.loading']
          ) : (
            <>
              {strings['booking.review.submit']} <span aria-hidden="true">→</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
