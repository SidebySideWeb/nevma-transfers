import { useId } from 'react';

export type TripType = 'transfer' | 'hourly';

export interface TripTypeSwitchProps {
  value: TripType;
  onChange: (value: TripType) => void;
  transferLabel: string;
  hourlyLabel: string;
  groupLabel?: string;
}

/** Segmented control. Native radios give arrow-key behaviour for free. */
export function TripTypeSwitch({ value, onChange, transferLabel, hourlyLabel, groupLabel }: TripTypeSwitchProps) {
  const name = useId();
  const items: [TripType, string][] = [
    ['transfer', transferLabel],
    ['hourly', hourlyLabel],
  ];
  return (
    <div className="trip-switch" role="radiogroup" aria-label={groupLabel ?? `${transferLabel} / ${hourlyLabel}`}>
      {items.map(([v, text]) => (
        <label key={v} className={`trip-switch-opt${value === v ? ' is-on' : ''}`}>
          <input
            type="radio"
            className="sr-only"
            name={name}
            value={v}
            checked={value === v}
            onChange={() => onChange(v)}
          />
          <span>{text}</span>
        </label>
      ))}
    </div>
  );
}
