import { useEffect, useState } from 'react';
import { DateField } from '../DateField';

type Props = {
  /** URL query parameter (`YYYY-MM-DD`) that may preset the date (e.g. `date`). */
  query?: string;
  id: string;
  name: string;
  label: string;
  initial?: string;
  required?: boolean;
  error?: string;
  /** Element id prefix for the error span (defaults to `name`). */
  errorKey?: string;
  fieldClass?: string;
  min?: string;
  placeholder?: string;
};

/** DateField with own state for static Astro forms (hidden input posts `name`). */
export default function FormDateField({
  query,
  id,
  name,
  label,
  initial = '',
  required,
  error,
  errorKey,
  fieldClass = 'f2',
  min,
  placeholder,
}: Props) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const q = query ? new URLSearchParams(window.location.search).get(query) : null;
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q) && (!min || q >= min)) setValue(q);
  }, []); // once on mount
  const errId = error ? `${errorKey ?? name}-err` : undefined;
  return (
    <DateField
      id={id}
      name={name}
      label={label}
      value={value}
      onChange={setValue}
      required={required}
      fieldClass={fieldClass}
      min={min}
      placeholder={placeholder}
      aria-invalid={error ? true : undefined}
      aria-describedby={errId}
    >
      {error ? (
        <span className="error" id={errId}>
          {error}
        </span>
      ) : null}
    </DateField>
  );
}
