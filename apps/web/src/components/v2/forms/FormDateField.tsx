import { useState } from 'react';
import { DateField } from '../DateField';

type Props = {
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
