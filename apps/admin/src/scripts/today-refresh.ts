/** Soft-refresh the Today board tables every 60s without layout shift or focus loss. */

const INTERVAL_MS = 60_000;

function stamp(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Athens',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
}

async function refresh(): Promise<void> {
  if (document.visibilityState === 'hidden') return;
  const fleet = document.getElementById('fleet-now-body');
  const drivers = document.getElementById('drivers-now-body');
  const updated = document.getElementById('today-updated');
  if (!fleet || !drivers) return;

  const active = document.activeElement as HTMLElement | null;
  const focusId = active?.id || null;
  const focusName =
    active instanceof HTMLElement && active.getAttribute('name')
      ? active.getAttribute('name')
      : null;

  try {
    const res = await fetch('/today?partial=1', {
      headers: { accept: 'text/html' },
      credentials: 'same-origin',
    });
    if (!res.ok) return;
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const nextFleet = doc.getElementById('fleet-now-body');
    const nextDrivers = doc.getElementById('drivers-now-body');
    const root = doc.getElementById('today-partial');
    if (nextFleet) fleet.innerHTML = nextFleet.innerHTML;
    if (nextDrivers) drivers.innerHTML = nextDrivers.innerHTML;
    const label = root?.getAttribute('data-updated') || stamp();
    if (updated) updated.textContent = `Updated ${label} · refreshes every minute`;

    if (focusId) {
      document.getElementById(focusId)?.focus({ preventScroll: true });
    } else if (focusName) {
      const el = document.querySelector(`[name="${CSS.escape(focusName)}"]`);
      if (el instanceof HTMLElement) el.focus({ preventScroll: true });
    }
  } catch {
    /* keep last good board */
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

function start(): void {
  if (timer) return;
  timer = setInterval(() => {
    void refresh();
  }, INTERVAL_MS);
}

function stop(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') stop();
  else {
    void refresh();
    start();
  }
});

start();
