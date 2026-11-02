import type { FormEvent } from 'react';
import { BrandDropdown } from '../v2/BrandDropdown';
import { DateField } from '../v2/DateField';
import { joinLocal, requestQuoteHref, splitLocal } from './v2/journey';
import type { BookingStrings, DetailsState, OptionsData, SearchState } from './types';

type Props = {
  strings: BookingStrings;
  options: OptionsData;
  search: SearchState;
  details: DetailsState;
  errors: Record<string, string>;
  formError: string | null;
  busy: boolean;
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
          <div className="field s636a1" data-v2-extra>
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
          />
        )}
      </div>

      <div className="grid">
        <div className="f2">
          <label htmlFor="b-pick">{strings['booking.pickup.address']}</label>
          <input
            id="b-pick"
            type="text"
            autoComplete="street-address"
            placeholder={strings['form.placeholder.address']}
            value={details.pickupAddress}
            onChange={(e) => onChangeDetails({ pickupAddress: e.target.value })}
            {...invalid('pickupAddress', 'b-pick')}
          />
          {err('pickupAddress', 'b-pick')}
        </div>
        {!hourly && (
          <div className="f2">
            <label htmlFor="b-drop">{strings['booking.dropoff.address']}</label>
            <input
              id="b-drop"
              type="text"
              placeholder={strings['form.placeholder.address']}
              value={details.dropoffAddress}
              onChange={(e) => onChangeDetails({ dropoffAddress: e.target.value })}
              {...invalid('dropoffAddress', 'b-drop')}
            />
            {err('dropoffAddress', 'b-drop')}
          </div>
        )}
        <DateField
          id="b-date"
          label={strings['booking.date'] ?? 'Date'}
          value={date}
          onChange={(iso) => onChange({ pickupLocal: joinLocal(iso, time) })}
          {...invalid('pickupLocal', 'b-date')}
        >
          {err('pickupLocal', 'b-date')}
        </DateField>
        <div className="f2">
          <label htmlFor="b-time">{strings['booking.time']}</label>
          <input
            id="b-time"
            type="time"
            value={time}
            onChange={(e) => onChange({ pickupLocal: joinLocal(date, e.target.value) })}
            {...invalid('pickupLocal', 'b-date')}
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
