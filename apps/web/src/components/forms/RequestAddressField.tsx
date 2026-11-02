import { AddressField, type PlaceValue } from '../booking/AddressField';
import { useState } from 'react';

type Props = {
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
