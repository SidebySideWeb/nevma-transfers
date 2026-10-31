import type { FormEvent } from 'react';
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

  return (
    <>
      <h1 tabIndex={-1}>{strings['booking.search.title']}</h1>
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
      <form className="card stack" onSubmit={handleSubmit} noValidate>
        <fieldset className="field">
          <legend className="sr-only">Booking type</legend>
          <div className="segmented" role="radiogroup" aria-label="Booking type">
            <label>
              <input
                type="radio"
                name="type"
                value="transfer"
                checked={search.type === 'transfer'}
                onChange={() => onChange({ type: 'transfer' })}
                aria-label={strings['booking.toggle.transfer']}
              />
              <span aria-hidden="true">{strings['booking.toggle.transfer']}</span>
            </label>
            <label>
              <input
                type="radio"
                name="type"
                value="hourly"
                checked={search.type === 'hourly'}
                onChange={() => onChange({ type: 'hourly' })}
                aria-label={strings['booking.toggle.hourly']}
              />
              <span aria-hidden="true">{strings['booking.toggle.hourly']}</span>
            </label>
          </div>
        </fieldset>

        <div className="grid grid-2">
          <div className="field" id="field-fromZone">
            <label htmlFor="from">{strings['booking.pickup.zone']}</label>
            <select
              id="from"
              className="input"
              value={search.fromZone}
              aria-invalid={Boolean(errors.fromZone)}
              aria-describedby={errors.fromZone ? 'from-err' : undefined}
              onChange={(e) => onChange({ fromZone: e.target.value })}
            >
              {options.zones.map((z) => (
                <option key={z.code} value={z.code}>
                  {z.name}
                </option>
              ))}
            </select>
            {errors.fromZone && (
              <span className="error" id="from-err">
                {errors.fromZone}
              </span>
            )}
          </div>

          {search.type === 'transfer' ? (
            <div className="field" id="field-toZone">
              <label htmlFor="to">{strings['booking.dropoff.zone']}</label>
              <select
                id="to"
                className="input"
                value={search.toZone}
                aria-invalid={Boolean(errors.toZone)}
                onChange={(e) => onChange({ toZone: e.target.value })}
              >
                {options.zones.map((z) => (
                  <option key={z.code} value={z.code}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="field" id="field-hours">
              <label htmlFor="hours">{strings['booking.hours.label']}</label>
              <select
                id="hours"
                className="input"
                value={search.hours}
                aria-describedby="hours-hint"
                onChange={(e) => onChange({ hours: Number(e.target.value) })}
              >
                {Array.from({ length: hourBounds.max - hourBounds.min + 1 }, (_, i) => hourBounds.min + i).map(
                  (h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ),
                )}
              </select>
              <span className="hint" id="hours-hint">
                {strings['booking.hours.hint']
                  ?.replace('{min}', String(hourBounds.min))
                  .replace('{max}', String(hourBounds.max))}
              </span>
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

        <button className="btn btn-block" type="submit" disabled={busy}>
          {busy ? strings['booking.loading'] : strings['booking.search.submit']}
        </button>
      </form>
    </>
  );
}
