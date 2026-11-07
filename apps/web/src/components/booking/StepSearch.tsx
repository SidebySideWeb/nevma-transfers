import { useMemo, useState, type FormEvent } from 'react';
import {
  earliestPickupLocal,
  hourlyDurationLabel,
  isAirportZone,
  meetsMinNotice,
  normaliseFlightNumber,
} from '../../lib/booking/hourly-labels';
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

const COUNT_MAX = 99;

const FIELD_ID: Record<string, string> = {
  fromZone: 'b-from',
  toZone: 'b-to',
  hours: 'b-hours',
  pickupAddress: 'b-pick',
  dropoffAddress: 'b-drop',
  pickupLocal: 'b-date',
  flightNumber: 'b-flight',
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

function timeOptions(): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 5) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return out;
}

const TIMES = timeOptions();

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
  const [pickupAreaKind, setPickupAreaKind] = useState<string | null>(null);
  const [showHourlyDropoff, setShowHourlyDropoff] = useState(Boolean(details.dropoffAddress));
  const [returnOn, setReturnOn] = useState(false);

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

  const kmPerHour = options.kmPerHour ?? 40;
  const fromZoneMeta = options.zones.find((z) => z.code === search.fromZone);
  const airportPickup =
    pickupAreaKind === 'airport' || (!distancePricing && isAirportZone(fromZoneMeta));

  const earliest = useMemo(
    () => earliestPickupLocal(new Date(), options.minLeadMinutes, options.timezone),
    [options.minLeadMinutes, options.timezone],
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
  const oneWay = strings['booking.toggle.oneWay'] ?? strings['booking.toggle.transfer'] ?? 'One way';
  const byHour = strings['booking.toggle.hourly'] ?? 'By the hour';
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

  const hourOptions = Array.from({ length: hourBounds.max - hourBounds.min + 1 }, (_, i) => {
    const h = hourBounds.min + i;
    return { value: String(h), label: hourlyDurationLabel(h, kmPerHour) };
  });

  const showFlight = airportPickup;
  const showAirportHint = airportPickup && !details.flightNumber.trim();
  const flightTracking = options.flightTracking === true;
  const returnTrip = options.returnTrip === true;
  const hideZones = distancePricing;

  const setType = (type: 'transfer' | 'hourly') => {
    if (search.type === type) return;
    onChange({ type });
  };

  return (
    <form className="s8f7a6 ep-book-bar" onSubmit={handleSubmit} noValidate>
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

      <div
        data-v2-extra
        className="js-trip ep-tabs"
        role="tablist"
        aria-label={`${oneWay} / ${byHour}`}
      >
        <button
          type="button"
          role="tab"
          className="dd-btn"
          aria-selected={search.type === 'transfer'}
          aria-pressed={search.type === 'transfer'}
          onClick={() => setType('transfer')}
        >
          <span>{oneWay}</span>
        </button>
        <button
          type="button"
          role="tab"
          className="dd-btn"
          aria-selected={hourly}
          aria-pressed={hourly}
          onClick={() => setType('hourly')}
        >
          <span>{byHour}</span>
        </button>
      </div>

      <div className="ep-bar-row">
        {!hideZones ? (
          <BrandDropdown
            id="b-from"
            name="fromZone"
            label={strings['booking.pickup.zone'] ?? 'Pick-up'}
            options={zones}
            value={search.fromZone}
            onChange={(fromZone) => onChange({ fromZone })}
            fieldClass="field sf1db8 ep-bar-field"
            error={errors.fromZone}
            {...invalid('fromZone', 'b-from')}
          />
        ) : null}

        <AddressField
          id="b-pick"
          label={strings['booking.pickup.address'] ?? 'Pick-up'}
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
          clearLabel={strings['booking.clear'] ?? 'Clear'}
          error={errors.pickupAddress}
          onAreaKind={(kind) => setPickupAreaKind(kind)}
          onChange={(pickupAddress, pickupPlace) => onChangeDetails({ pickupAddress, pickupPlace })}
          {...invalid('pickupAddress', 'b-pick')}
        />

        {hourly ? (
          <BrandDropdown
            id="b-hours"
            name="hours"
            label={strings['booking.hours.duration'] ?? strings['booking.hours.label'] ?? 'Duration'}
            options={hourOptions}
            value={String(search.hours)}
            onChange={(v) => onChange({ hours: Number(v) })}
            fieldClass={wrapClass('field s636a1 ep-bar-field', 'hours')}
            error={errors.hours}
            {...invalid('hours', 'b-hours')}
          />
        ) : !hideZones ? (
          <BrandDropdown
            id="b-to"
            name="toZone"
            label={strings['booking.dropoff.zone'] ?? 'Drop-off'}
            options={zones}
            value={search.toZone}
            onChange={(toZone) => onChange({ toZone })}
            fieldClass="field s636a1 ep-bar-field"
            error={errors.toZone}
            {...invalid('toZone', 'b-to')}
          />
        ) : null}

        {(!hourly || showHourlyDropoff) && (
          <AddressField
            id="b-drop"
            label={strings['booking.dropoff.address'] ?? 'Drop-off'}
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
            clearLabel={strings['booking.clear'] ?? 'Clear'}
            error={errors.dropoffAddress}
            onChange={(dropoffAddress, dropoffPlace) =>
              onChangeDetails({ dropoffAddress, dropoffPlace })
            }
            {...invalid('dropoffAddress', 'b-drop')}
          />
        )}

        {hourly && !showHourlyDropoff ? (
          <div className="ep-bar-link">
            <button
              type="button"
              className="sd347e"
              onClick={() => setShowHourlyDropoff(true)}
            >
              {strings['booking.hourly.differentDropoff'] ?? 'Different drop-off address'}
            </button>
          </div>
        ) : null}

        <DateField
          id="b-date"
          label={strings['booking.date'] ?? 'Date'}
          value={date}
          onChange={(iso) => onChange({ pickupLocal: joinLocal(iso, time) })}
          fieldClass={wrapClass('f2 ep-bar-field', 'pickupLocal')}
          {...invalid('pickupLocal', 'b-date')}
        >
          {err('pickupLocal', 'b-date')}
        </DateField>

        {showFlight ? (
          <div className={wrapClass('f2 ep-bar-field', 'flightNumber')}>
            <label htmlFor="b-flight">{strings['booking.flight'] ?? 'Flight number'}</label>
            <input
              id="b-flight"
              type="text"
              inputMode="text"
              autoComplete="off"
              placeholder={strings['form.placeholder.flight'] ?? 'e.g. A3 603, LH1284'}
              value={details.flightNumber}
              onChange={(e) =>
                onChangeDetails({ flightNumber: normaliseFlightNumber(e.target.value) })
              }
              {...invalid('flightNumber', 'b-flight')}
            />
            {err('flightNumber', 'b-flight')}
          </div>
        ) : null}

        <div className={wrapClass('ep-bar-field', 'pickupLocal')}>
          <BrandDropdown
            id="b-time"
            name="pickupTime"
            label={strings['booking.time'] ?? 'Pick-up time'}
            options={TIMES.map((t) => ({ value: t, label: t }))}
            value={
              time && TIMES.includes(time.slice(0, 5))
                ? time.slice(0, 5)
                : time
                  ? TIMES.reduce((best, t) => (t <= time.slice(0, 5) ? t : best), '00:00')
                  : ''
            }
            onChange={(t) => onChange({ pickupLocal: joinLocal(date, t) })}
            fieldClass="field ep-time-dd"
            error={errors.pickupLocal}
            {...invalid('pickupLocal', 'b-time')}
          />
          <span className="js-hint">{strings['booking.athensHint'] ?? 'Athens time'}</span>
        </div>

        <div className="ep-bar-cta ep-bar-cta-desktop">
          <button className="btn btn-gold sd0928" type="submit" disabled={busy}>
            {busy
              ? strings['booking.loading']
              : (strings['booking.search.viewOptions'] ??
                strings['booking.search.submit'] ??
                'View options')}
          </button>
        </div>
      </div>

      {returnTrip ? (
        <div className="ep-return" data-v2-extra>
          <label className="ep-return-switch">
            <input
              type="checkbox"
              checked={returnOn}
              onChange={(e) => setReturnOn(e.target.checked)}
            />
            <span>{strings['booking.return.add'] ?? 'Add return'}</span>
          </label>
          {returnOn ? (
            <p className="js-hint" role="status">
              {strings['booking.return.comingSoon'] ?? 'Return trip details come next.'}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="ep-return ep-return-hidden" hidden aria-hidden="true" data-v2-extra />
      )}

      {showAirportHint ? (
        <div className="ep-airport-hint" role="status" data-v2-extra>
          <span className="ep-airport-icon" aria-hidden="true">
            ✈
          </span>
          <p>
            {flightTracking
              ? (strings['booking.airport.hintTracking'] ??
                "Enter your flight number. We'll track your flight and meet you at the right terminal.")
              : (strings['booking.airport.hint'] ??
                'Add your flight number so your chauffeur meets you at arrivals.')}
          </p>
        </div>
      ) : null}

      <div className="grid ep-pax-row">
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
        <a className="sd347e" href={requestQuoteHref(search)}>
          {strings['booking.quoteLink']}
        </a>
      </div>

      <div className="ep-bar-cta-sticky" data-v2-extra>
        <button className="btn btn-gold sd0928" type="submit" disabled={busy}>
          {busy
            ? strings['booking.loading']
            : (strings['booking.search.viewOptions'] ??
              strings['booking.search.submit'] ??
              'View options')}
        </button>
      </div>

      {/* Expose earliest for tests / parent validation without a second clock. */}
      <input type="hidden" name="earliestPickup" value={earliest} readOnly aria-hidden="true" />
      {!meetsMinNotice(search.pickupLocal || earliest, earliest) && search.pickupLocal ? (
        <span className="js-sr-only" data-min-notice-fail>
          min_notice
        </span>
      ) : null}
    </form>
  );
}
