export interface StepIndicatorProps {
  steps: string[];
  /** zero-based index of the current step */
  current: number;
  label: string;
}

/** Numbered progress list. Presentational: the reducer owns the step. */
export function StepIndicator({ steps, current, label }: StepIndicatorProps) {
  return (
    <ol className="step-indicator" aria-label={label}>
      {steps.map((text, i) => (
        <li key={text} className={i < current ? 'is-done' : undefined} aria-current={i === current ? 'step' : undefined}>
          <span className="step-indicator-bar" aria-hidden="true" />
          <span className="step-indicator-label">
            <span className="step-indicator-n">{i + 1}.</span> {text}
          </span>
        </li>
      ))}
    </ol>
  );
}
