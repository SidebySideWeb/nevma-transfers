import type { FormEvent } from 'react';
import { BrandDropdown } from '../v2/BrandDropdown';
import { DateField } from '../v2/DateField';
import { joinLocal, requestQuoteHref, splitLocal } from './v2/journey';
import { AddressField } from './AddressField';
import type { BookingStrings, DetailsState, OptionsData, SearchState } from './types';

type Props = {
  strings: BookingStrings;
  options: OptionsData;
  search: SearchState;
  details: DetailsState;
  errors: Record<string, string>;
  formError: string | null;
  busy: boolean;
  addressAutocomplete: boolean;
  /** FEATURE_DISTANCE_PRICING: Attica check + out-of-area message under the field. */
  distancePricing?: boolean;
  whatsappHref?: string | null;
  onChange: (patch: Partial<SearchState>) => void;
  onChangeDetails: (patch: Partial<DetailsState>) => void;
  onSubmit: () => void;
};

// ponytail: plain +/- with a minimum only. A max would clamp over-capacity requests here; the server
// answers those with no_price / unavailable (AC-16), so they must reach it. 99 only stops runaway clicks.
const COUNT_MAX = 99;

/** Error summary links go to the control that has the problem. */
const FIELD_ID: Record<string, string> = {
  fromZone: 'b-from',
  toZone: 'b-to',
  hours: 'lbl-hours',
  pickupAddress: 'b-pick',
  dropoffAddress: 'b-drop',
  pickupLocal: 'b-date',
};

type StepperProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  fewer: string;
  more: string;
  onChange: (n: number) => void;
};

function CountStepper({ id, label, value, min, max, fewer, more, onChange }: StepperProps) {
  return (
    <>
      <span className="lbl" id={id}>
        {label}
      </span>
      <div className="stepper" role="group" aria-labelledby={id}>
        <button
          type="button"
          aria-label={`${fewer} ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <span>{value}</span>
        <button
          type="button"
          aria-label={`${more} ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          +
        </button>
      </div>
    </>
  );
}

export function StepSearch({
  strings,
  options,
  search,
  details,
  errors,
  formError,
  busy,
  addressAutocomplete,
  distancePricing = false,
  whatsappHref = null,
  onChange,
  onChangeDetails,
  onSubmit,
}: Props) {
  const hourBounds = options.classes.reduce(
    (acc, c) => {
      if (!c.hourly) return acc;
      return {
        min: Math.min(acc.min, c.hourly.minHours),
        max: Math.max(acc.max, c.hourly.maxHours),
      };
    },
    { min: 3, max: 12 },
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const errorKeys = Object.keys(errors);
  const zones = options.zones.map((z) => ({ value: z.code, label: z.name }));
  const { date, time } = splitLocal(search.pickupLocal);
  const hourly = search.type === 'hourly';
  const fewer = strings['form.stepper.fewer'] ?? '';
  const more = strings['form.stepper.more'] ?? '';
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
  const wrapClass = (base: string, k: string) => (errors[k] ? `${base} is-invalid` : base);

  return (
    <form className="s8f7a6" onSubmit={handleSubmit} noValidate>
      {(formError || errorKeys.length > 0) && (
        <div className="notice notice-danger" role="alert" tabIndex={-1} id="error-summary">
          <p>
            <strong>{strings['booking.errors.summary']}</strong>
          </p>
          {formError && formError !== strings['booking.errors.summary'] && <p>{formError}</p>}
          <ul>
            {errorKeys.map((k) => (
              <li key={k}>
                <a href={`#${FIELD_ID[k] ?? k}`}>{errors[k]}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Added after the design (extra/08b-book-hourly): Transfer / By the hour, from the zone-field classes. */}
      <div
        data-v2-extra
        className="js-trip"
        role="group"
        aria-label={`${strings['booking.toggle.transfer']} / ${strings['booking.toggle.hourly']}`}
      >
        {(['transfer', 'hourly'] as const).map((type) => (
          <button
            key={type}
            type="button"
            className="dd-btn"
            aria-pressed={search.type === type}
            onClick={() => search.type !== type && onChange({ type })}
          >
            <span>{strings[`booking.toggle.${type}`]}</span>
          </button>
        ))}
      </div>

      <div className="s05d33">
        <BrandDropdown
          id="b-from"
          name="fromZone"
          label={strings['booking.pickup.zone'] ?? ''}
          options={zones}
          value={search.fromZone}
          onChange={(fromZone) => onChange({ fromZone })}
          fieldClass="field sf1db8"
          error={errors.fromZone}
          {...invalid('fromZone', 'b-from')}
        />
        <div className="sc5f4a">
          <button
            type="button"
            className="swap"
            aria-label={strings['booking.swap']}
            disabled={hourly}
            onClick={() => onChange({ fromZone: search.toZone, toZone: search.fromZone })}
          >
            ⇄
          </button>
        </div>
        {hourly ? (
          <div className={wrapClass('field s636a1', 'hours')} data-v2-extra>
            <CountStepper
              id="lbl-hours"
              label={strings['booking.hours.label'] ?? ''}
              value={search.hours}
              min={hourBounds.min}
              max={hourBounds.max}
              fewer={fewer}
              more={more}
              onChange={(hours) => onChange({ hours })}
            />
            <span className="js-hint">
              {(strings['booking.hours.hint'] ?? '')
                .replace('{min}', String(hourBounds.min))
                .replace('{max}', String(hourBounds.max))}
            </span>
            {err('hours', 'lbl-hours')}
          </div>
        ) : (
          <BrandDropdown
            id="b-to"
            name="toZone"
            label={strings['booking.dropoff.zone'] ?? ''}
            options={zones}
            value={search.toZone}
            onChange={(toZone) => onChange({ toZone })}
            fieldClass="field s636a1"
            error={errors.toZone}
            {...invalid('toZone', 'b-to')}
          />
        )}
      </div>

      <div className="grid">
        <AddressField
          id="b-pick"
          label={strings['booking.pickup.address'] ?? ''}
          name="pickupAddress"
          placePrefix="pickup"
          placeholder={strings['form.placeholder.address']}
          value={details.pickupAddress}
          place={details.pickupPlace}
          enabled={addressAutocomplete}
          checkServiceArea={distancePricing}
          outOfAreaText={strings['booking.serviceArea.outOfArea']}
          contactLabel={strings['booking.serviceArea.contact']}
          whatsappHref={whatsappHref}
          whatsappLabel={strings['booking.serviceArea.whatsapp']}
          error={errors.pickupAddress}
          onChange={(pickupAddress, pickupPlace) => onChangeDetails({ pickupAddress, pickupPlace })}
          {...invalid('pickupAddress', 'b-pick')}
        />
        {!hourly && (
          <AddressField
            id="b-drop"
            label={strings['booking.dropoff.address'] ?? ''}
            name="dropoffAddress"
            placePrefix="dropoff"
            placeholder={strings['form.placeholder.address']}
            value={details.dropoffAddress}
            place={details.dropoffPlace}
            enabled={addressAutocomplete}
            checkServiceArea={distancePricing}
            outOfAreaText={strings['booking.serviceArea.outOfArea']}
            contactLabel={strings['booking.serviceArea.contact']}
            whatsappHref={whatsappHref}
            whatsappLabel={strings['booking.serviceArea.whatsapp']}
            error={errors.dropoffAddress}
            onChange={(dropoffAddress, dropoffPlace) =>
              onChangeDetails({ dropoffAddress, dropoffPlace })
            }
            {...invalid('dropoffAddress', 'b-drop')}
          />
        )}
        <DateField
          id="b-date"
          label={strings['booking.date'] ?? 'Date'}
          value={date}
          onChange={(iso) => onChange({ pickupLocal: joinLocal(iso, time) })}
          fieldClass={wrapClass('f2', 'pickupLocal')}
          {...invalid('pickupLocal', 'b-date')}
        >
          {err('pickupLocal', 'b-date')}
        </DateField>
        <div className={wrapClass('f2', 'pickupLocal')}>
          <label htmlFor="b-time">{strings['booking.time']}</label>
          <input
            id="b-time"
            type="time"
            value={time}
            onChange={(e) => onChange({ pickupLocal: joinLocal(date, e.target.value) })}
            {...invalid('pickupLocal', 'b-time')}
          />
        </div>
        <div className="f2">
          <label htmlFor="b-flight">{strings['booking.flight']}</label>
          <input
            id="b-flight"
            type="text"
            placeholder={strings['form.placeholder.flight']}
            value={details.flightNumber}
            onChange={(e) => onChangeDetails({ flightNumber: e.target.value })}
          />
        </div>
        <div className="f2 s69376">
          <div className="sf8c7d">
            <CountStepper
              id="lbl-pax"
              label={strings['booking.passengers'] ?? ''}
              value={search.passengers}
              min={1}
              max={COUNT_MAX}
              fewer={fewer}
              more={more}
              onChange={(passengers) => onChange({ passengers })}
            />
          </div>
          <div className="sf8c7d">
            <CountStepper
              id="lbl-bags"
              label={strings['booking.luggage'] ?? ''}
              value={search.luggage}
              min={0}
              max={COUNT_MAX}
              fewer={fewer}
              more={more}
              onChange={(luggage) => onChange({ luggage })}
            />
          </div>
        </div>
      </div>

      <div className="s1bf70">
        <button className="btn btn-gold sd0928" type="submit" disabled={busy}>
          {busy ? (
            strings['booking.loading']
          ) : (
            <>
              {strings['booking.search.submit']} <span aria-hidden="true">→</span>
            </>
          )}
        </button>
        <a className="sd347e" href={requestQuoteHref(search)}>
          {strings['booking.quoteLink']}
        </a>
      </div>
    </form>
  );
}
