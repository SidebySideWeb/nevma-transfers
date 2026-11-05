/** Relative English phrasing for admin tooltips/labels (Athens wall clock optional). */
export function formatRelativeTime(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const delta = Math.round((nowMs - then) / 1000);
  const abs = Math.abs(delta);
  const future = delta < 0;
  const n = (unit: string, count: number) =>
    future ? `in ${count} ${unit}` : `${count} ${unit} ago`;

  if (abs < 45) return future ? 'in a moment' : 'just now';
  if (abs < 90) return n('min', 1);
  if (abs < 3600) return n('min', Math.round(abs / 60));
  if (abs < 5400) return n('hour', 1);
  if (abs < 86400) return n('hours', Math.round(abs / 3600));
  if (abs < 172800) return future ? 'tomorrow' : 'yesterday';
  return n('days', Math.round(abs / 86400));
}

export function formatExactAthens(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Athens',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}
