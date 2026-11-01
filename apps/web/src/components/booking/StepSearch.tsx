import type { FormEvent } from 'react';
import { Notice, Stepper, TripTypeSwitch, ZoneSelect } from '../ui';
import type { BookingStrings, OptionsData, SearchState } from './types';

type Props = {
  strings: BookingStrings;
  options: OptionsData;
  search: SearchState;
  errors: Record<string, string>;
  formError: string | null;
  busy: boolean;
  onChange: (patch: Partial<SearchState>) => void;
  onSubmit: () => void;
};

export function StepSearch({
  strings,
  options,
  search,
  errors,
  formError,
  busy,
  onChange,
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

  return (
    <>
      <h1 tabIndex={-1}>{strings['booking.search.title']}</h1>
      {(formError || errorKeys.length > 0) && (
        <Notice tone="danger" role="alert" tabIndex={-1} id="error-summary">
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
        </Notice>
      )}
      <form className="card stack" onSubmit={handleSubmit} noValidate>
        <TripTypeSwitch
          value={search.type}
          onChange={(type) => onChange({ type })}
          transferLabel={strings['booking.toggle.transfer'] ?? ''}
          hourlyLabel={strings['booking.toggle.hourly'] ?? ''}
          groupLabel="Booking type"
        />

        <div className="grid grid-2">
          <div id="field-fromZone">
            <ZoneSelect
              id="from"
              name="fromZone"
              label={strings['booking.pickup.zone'] ?? ''}
              options={zones}
              value={search.fromZone}
              onChange={(fromZone) => onChange({ fromZone })}
              error={errors.fromZone}
              swapWith={
                search.type === 'transfer'
                  ? {
                      otherValue: search.toZone,
                      onSwap: () => onChange({ fromZone: search.toZone, toZone: search.fromZone }),
                    }
                  : undefined
              }
            />
          </div>

          {search.type === 'transfer' ? (
            <div id="field-toZone">
              <ZoneSelect
                id="to"
                name="toZone"
                label={strings['booking.dropoff.zone'] ?? ''}
                options={zones}
                value={search.toZone}
                onChange={(toZone) => onChange({ toZone })}
                error={errors.toZone}
              />
            </div>
          ) : (
            <div id="field-hours">
              <Stepper
                id="hours"
                label={strings['booking.hours.label'] ?? ''}
                value={search.hours}
                min={hourBounds.min}
                max={hourBounds.max}
                onChange={(hours) => onChange({ hours })}
                error={errors.hours}
              />
              <p className="hint" id="hours-hint">
                {strings['booking.hours.hint']
                  ?.replace('{min}', String(hourBounds.min))
                  .replace('{max}', String(hourBounds.max))}
              </p>
            </div>
          )}

          <div className="field" id="field-pickupLocal">
            <label htmlFor="date">{strings['booking.pickup.datetime']}</label>
            <input
              id="date"
              className="input"
              type="datetime-local"
              value={search.pickupLocal}
              aria-invalid={Boolean(errors.pickupLocal)}
              aria-describedby={errors.pickupLocal ? 'date-err date-hint' : 'date-hint'}
              onChange={(e) => onChange({ pickupLocal: e.target.value })}
              required
            />
            <span className="hint" id="date-hint">
              {strings['booking.athensHint']}
            </span>
            {errors.pickupLocal && (
              <span className="error" id="date-err">
                {errors.pickupLocal}
              </span>
            )}
          </div>

          {/* ponytail: plain number inputs, not Steppers. A Stepper clamps to a max, but over-capacity
              requests must reach the server (it answers no_price/unavailable, see e2e). */}
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="pax">{strings['booking.passengers']}</label>
              <input
                id="pax"
                className="input"
                type="number"
                min={1}
                value={search.passengers}
                onChange={(e) => onChange({ passengers: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor="bags">{strings['booking.luggage']}</label>
              <input
                id="bags"
                className="input"
                type="number"
                min={0}
                value={search.luggage}
                onChange={(e) => onChange({ luggage: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>

        <button className="btn btn-gold btn-block" type="submit" disabled={busy}>
          {busy ? strings['booking.loading'] : strings['booking.search.submit']}
        </button>
      </form>
    </>
  );
}
