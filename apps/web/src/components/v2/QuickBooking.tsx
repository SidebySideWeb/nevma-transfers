import { useMemo, useState } from 'react';
import { BrandDropdown } from './BrandDropdown';

export type QuickZone = { code: string; name: string };
export type QuickHourly = { minHours: number; maxHours: number };

export type QuickBookingProps = {
  zones: QuickZone[];
  hourlyBounds: QuickHourly;
  labels: {
    form: string;
    from: string;
    to: string;
    hours: string;
    date: string;
    time: string;
    passengers: string;
    submit: string;
    swap: string;
    transfer: string;
    hourly: string;
    fewerHours: string;
    moreHours: string;
  };
  defaultFrom?: string;
  defaultTo?: string;
};

function pickDefaults(zones: QuickZone[], from?: string, to?: string) {
  const codes = new Set(zones.map((z) => z.code));
  const f =
    (from && codes.has(from) && from) ||
    zones.find((z) => /airport/i.test(z.code) || /airport/i.test(z.name))?.code ||
    zones[0]?.code ||
    '';
  const t =
    (to && codes.has(to) && to) ||
    zones.find((z) => z.code !== f && (/centre|center|athens$/i.test(z.code) || z.name === 'Athens'))
      ?.code ||
    zones.find((z) => z.code !== f)?.code ||
    '';
  return { from: f, to: t };
}

/** Build `/book` query string from widget state (no price fields). */
export function quickBookingQuery(input: {
  type: 'transfer' | 'hourly';
  from: string;
  to: string;
  hours: number;
  date: string;
  time: string;
  passengers: number;
}): string {
  const q = new URLSearchParams();
  q.set('type', input.type);
  if (input.from) q.set('from', input.from);
  if (input.type === 'transfer' && input.to) q.set('to', input.to);
  if (input.type === 'hourly') q.set('hours', String(input.hours));
  if (input.date) q.set('date', input.date);
  if (input.time) q.set('time', input.time);
  if (input.passengers > 0) q.set('passengers', String(input.passengers));
  const s = q.toString();
  return s ? `/book?${s}` : '/book';
}

export function QuickBooking({
  zones,
  hourlyBounds,
  labels,
  defaultFrom,
  defaultTo,
}: QuickBookingProps) {
  const defaults = useMemo(
    () => pickDefaults(zones, defaultFrom, defaultTo),
    [zones, defaultFrom, defaultTo],
  );
  const [type, setType] = useState<'transfer' | 'hourly'>('transfer');
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [hours, setHours] = useState(hourlyBounds.minHours);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('14:30');
  const [passengers, setPassengers] = useState(2);

  const options = zones.map((z) => ({ value: z.code, label: z.name }));
  const href = quickBookingQuery({ type, from, to, hours, date, time, passengers });

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const clampHours = (n: number) =>
    Math.max(hourlyBounds.minHours, Math.min(hourlyBounds.maxHours, n));

  return (
    <form
      className="s70eaa"
      aria-label={labels.form}
      action="/book"
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        window.location.assign(href);
      }}
    >
      <style>{`.s70eaa .ddl{position:absolute;left:0;right:0;top:100%;margin:2px 0 0;padding:4px 0;list-style:none;background:#15181A;border:1px solid #CFA45F;box-shadow:0 16px 40px rgba(0,0,0,.6);z-index:31}.s70eaa [data-v2-extra]{display:flex;flex:1 1 100%;gap:8px;padding:10px 18px;box-sizing:border-box;border-bottom:1px solid rgba(207,164,95,.22)}.s70eaa [data-v2-extra] .dd-btn{flex:1;justify-content:center;height:36px;border:1px solid rgba(207,164,95,.45);padding:0 12px}.s70eaa [data-v2-extra] .dd-btn[aria-pressed="true"]{background:#E7C687;color:#0A0A0B}`}</style>

      <div data-v2-extra role="radiogroup" aria-label={`${labels.transfer} / ${labels.hourly}`}>
        <button
          type="button"
          className="dd-btn"
          aria-pressed={type === 'transfer'}
          onClick={() => setType('transfer')}
        >
          <span>{labels.transfer}</span>
        </button>
        <button
          type="button"
          className="dd-btn"
          aria-pressed={type === 'hourly'}
          onClick={() => setType('hourly')}
        >
          <span>{labels.hourly}</span>
        </button>
        <input type="hidden" name="type" value={type} />
      </div>

      <BrandDropdown
        id="q-from"
        name="from"
        label={labels.from}
        options={options}
        value={from}
        onChange={setFrom}
        required
      />

      <div className="sc5f4a">
        <button
          type="button"
          className="swap"
          aria-label={labels.swap}
          disabled={type !== 'transfer'}
          onClick={swap}
        >
          ⇄
        </button>
      </div>

      {type === 'transfer' ? (
        <BrandDropdown
          id="q-to"
          name="to"
          label={labels.to}
          options={options}
          value={to}
          onChange={setTo}
          required
        />
      ) : (
        <div className="field s2f216">
          <label id="q-hours-lbl">{labels.hours}</label>
          <div className="stepper" role="group" aria-labelledby="q-hours-lbl">
            <button
              type="button"
              aria-label={labels.fewerHours}
              disabled={hours <= hourlyBounds.minHours}
              onClick={() => setHours((h) => clampHours(h - 1))}
            >
              −
            </button>
            <span>{hours}</span>
            <button
              type="button"
              aria-label={labels.moreHours}
              disabled={hours >= hourlyBounds.maxHours}
              onClick={() => setHours((h) => clampHours(h + 1))}
            >
              +
            </button>
          </div>
          <input type="hidden" name="hours" value={hours} />
        </div>
      )}

      <div className="field s984cb">
        <label htmlFor="q-date">{labels.date}</label>
        <input id="q-date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="field s10827">
        <label htmlFor="q-time">{labels.time}</label>
        <input
          id="q-time"
          name="time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </div>
      <div className="field s87a0c">
        <label htmlFor="q-pax">{labels.passengers}</label>
        <input
          id="q-pax"
          name="passengers"
          type="number"
          min={1}
          value={passengers}
          onChange={(e) => setPassengers(Number(e.target.value) || 1)}
        />
      </div>
      <a className="btn btn-gold sc27fa" href={href}>
        {labels.submit}
      </a>
    </form>
  );
}
