import { AddressField, type PlaceValue } from '../booking/AddressField';
import { useEffect, useState } from 'react';

type Props = {
  /** URL query parameter that may preset the address text (e.g. `pickup`). */
  query?: string;
  id: string;
  name: 'pickupAddress' | 'dropoffAddress';
  placePrefix: 'pickup' | 'dropoff';
  label: string;
  placeholder?: string;
  initialValue?: string;
  error?: string;
  enabled: boolean;
};

/** Island wrapper so EnquiryForm keeps SSR labels/values while suggestions run client-side. */
export default function RequestAddressField({
  query,
  id,
  name,
  placePrefix,
  label,
  placeholder,
  initialValue = '',
  error,
  enabled,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [place, setPlace] = useState<PlaceValue>(null);
  useEffect(() => {
    const q = query ? new URLSearchParams(window.location.search).get(query) : null;
    if (q && !initialValue) setValue(q.slice(0, 200));
  }, []); // once on mount

  return (
    <AddressField
      id={id}
      name={name}
      placePrefix={placePrefix}
      label={label}
      placeholder={placeholder}
      value={value}
      place={place}
      enabled={enabled}
      error={error}
      onChange={(text, next) => {
        setValue(text);
        setPlace(next);
      }}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-err` : undefined}
    />
  );
}
