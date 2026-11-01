import { useEffect, useMemo, useState } from 'react';
import { Stepper, TripTypeSwitch, ZoneSelect } from '../ui';

type Zone = { code: string; name: string };
type HourlyBounds = { min: number; max: number };

type Props = {
  transferLabel: string;
  hourlyLabel: string;
  fromLabel: string;
  toLabel: string;
  hoursLabel: string;
  dateLabel: string;
  timeLabel: string;
  passengersLabel: string;
  submitLabel: string;
  swapLabel: string;
  note: string;
};

export default function HomeQuickBook(props: Props) {
  const [type, setType] = useState<'transfer' | 'hourly'>('transfer');
  const [zones, setZones] = useState<Zone[]>([]);
  const [hoursBounds, setHoursBounds] = useState<HourlyBounds>({ min: 3, max: 12 });
  const [fromZone, setFromZone] = useState('');
  const [toZone, setToZone] = useState('');
  const [hours, setHours] = useState(3);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('14:30');
  const [passengers, setPassengers] = useState(2);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/booking-options', { headers: { accept: 'application/json' } });
        if (!res.ok) return;
        const data = (await res.json()) as {
          zones?: Zone[];
          classes?: { hourly?: { minHours: number; maxHours: number } | null }[];
        };
        if (cancelled) return;
        const z = data.zones ?? [];
        setZones(z);
        if (z[0]) setFromZone(z[0].code);
        if (z[1]) setToZone(z[1].code);
        const bounds = (data.classes ?? []).reduce(
          (acc, c) => {
            if (!c.hourly) return acc;
            return {
              min: Math.min(acc.min, c.hourly.minHours),
              max: Math.max(acc.max, c.hourly.maxHours),
            };
          },
          { min: 3, max: 12 },
        );
        setHoursBounds(bounds);
        setHours(bounds.min);
      } catch {
        /* keep empty; form still navigates */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(
    () => zones.map((z) => ({ value: z.code, label: z.name })),
    [zones],
  );

  const href = useMemo(() => {
    const q = new URLSearchParams();
    q.set('type', type);
    if (fromZone) q.set('from', fromZone);
    if (type === 'transfer' && toZone) q.set('to', toZone);
    if (type === 'hourly') q.set('hours', String(hours));
    if (date) q.set('date', date);
    if (time) q.set('time', time);
    q.set('passengers', String(passengers));
    return `/book?${q.toString()}#search`;
  }, [type, fromZone, toZone, hours, date, time, passengers]);

  return (
    <form
      className="quick-book"
      aria-label={props.submitLabel}
      onSubmit={(e) => {
        e.preventDefault();
        window.location.href = href;
      }}
    >
      <div className="quick-book-type">
        <TripTypeSwitch
          value={type}
          onChange={setType}
          transferLabel={props.transferLabel}
          hourlyLabel={props.hourlyLabel}
        />
      </div>
      <div className="quick-book-fields">
        <ZoneSelect
          id="q-from"
          label={props.fromLabel}
          options={options}
          value={fromZone}
          onChange={setFromZone}
          swapWith={
            type === 'transfer'
              ? {
                  otherValue: toZone,
                  onSwap: () => {
                    setFromZone(toZone);
                    setToZone(fromZone);
                  },
                }
              : undefined
          }
          swapLabel={props.swapLabel}
        />
        {type === 'transfer' ? (
          <ZoneSelect
            id="q-to"
            label={props.toLabel}
            options={options}
            value={toZone}
            onChange={setToZone}
          />
        ) : (
          <Stepper
            id="q-hours"
            label={props.hoursLabel}
            value={hours}
            min={hoursBounds.min}
            max={hoursBounds.max}
            onChange={setHours}
          />
        )}
        <div className="field">
          <label htmlFor="q-date">{props.dateLabel}</label>
          <input
            id="q-date"
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="q-time">{props.timeLabel}</label>
          <input
            id="q-time"
            className="input"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="q-pax">{props.passengersLabel}</label>
          <input
            id="q-pax"
            className="input"
            type="number"
            min={1}
            value={passengers}
            onChange={(e) => setPassengers(Number(e.target.value) || 1)}
          />
        </div>
        <button className="btn btn-gold quick-book-submit" type="submit">
          {props.submitLabel}
        </button>
      </div>
      <p className="quick-book-note">{props.note}</p>
    </form>
  );
}
