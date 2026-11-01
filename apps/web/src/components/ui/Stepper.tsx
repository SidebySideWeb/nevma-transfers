export interface StepperProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  error?: string;
  decreaseLabel?: string;
  increaseLabel?: string;
}

export function Stepper({
  id,
  label,
  value,
  min,
  max,
  onChange,
  disabled,
  error,
  decreaseLabel = 'Decrease',
  increaseLabel = 'Increase',
}: StepperProps) {
  const v = Math.max(min, Math.min(max, value));
  const set = (n: number) => onChange(Math.max(min, Math.min(max, n)));
  const errId = `${id}-err`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="stepper">
        <button
          type="button"
          className="stepper-btn"
          aria-label={`${decreaseLabel} ${label}`}
          aria-controls={id}
          disabled={disabled || v <= min}
          onClick={() => set(v - 1)}
        >
          <span aria-hidden="true">−</span>
        </button>
        <input
          id={id}
          className="stepper-val"
          type="number"
          readOnly
          value={v}
          min={min}
          max={max}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
        />
        <button
          type="button"
          className="stepper-btn"
          aria-label={`${increaseLabel} ${label}`}
          aria-controls={id}
          disabled={disabled || v >= max}
          onClick={() => set(v + 1)}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      {error && (
        <p id={errId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
