/** Fleet calendar: scroll to 06:00, empty-time popover, week cells open the day. */

const scroller = document.getElementById('cal-scroll');

if (scroller) {
  scroller.scrollLeft = Number(scroller.dataset.scrollLeft || 0);

  const tz = 'Europe/Athens';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const part = (ms: number) =>
    Object.fromEntries(parts.formatToParts(ms).map((p) => [p.type, p.value])) as Record<string, string>;
  const hhmm = (ms: number) => {
    const p = part(ms);
    return `${p.hour}:${p.minute}`;
  };
  const local = (ms: number) => {
    const p = part(ms);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };

  const pop = document.getElementById('cal-pop');
  const quarter = 15 * 60_000;
  let opener: HTMLElement | null = null;

  const close = () => {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    opener?.focus();
    opener = null;
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (pop && !pop.hidden && !pop.contains(t) && !t.closest('.cal-empty')) {
      pop.hidden = true;
      opener = null;
    }
  });

  // Empty time on a vehicle -> New booking or Block for that vehicle and time.
  scroller.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('.cal-empty');
    if (!link || !pop) return;
    e.preventDefault();
    const track = link.closest<HTMLElement>('.cal-track')!;
    const vehicle = track.dataset.vehicle!;
    const dayStart = Number(track.dataset.dayStart);
    const rect = track.getBoundingClientRect();
    // Keyboard activation has no pointer position (detail 0): use the default time.
    const ms =
      e.detail === 0
        ? Number(scroller.dataset.defaultMs)
        : dayStart + Math.floor(((e.clientX - rect.left) / 56) * 60 * 60_000 / quarter) * quarter;

    const busy = (JSON.parse(track.dataset.busy || '[]') as [number, number][]).sort((a, b) => a[0] - b[0]);
    const inside = busy.find(([s, en]) => s <= ms && ms < en);
    const next = busy.find(([s]) => s > ms);
    const text = inside
      ? `Busy until ${hhmm(inside[1])} (booked or buffer).`
      : next
        ? `Free until ${hhmm(next[0])}.`
        : 'Free for the rest of the day.';

    const label = track.dataset.label ?? '';
    const strong = document.createElement('strong');
    strong.style.cssText = 'color:var(--color-text);font-weight:500';
    strong.textContent = `${label} · ${hhmm(ms)}`;
    document.getElementById('cal-pop-text')!.replaceChildren(strong, document.createElement('br'), text);
    const at = local(ms);
    (document.getElementById('cal-pop-new') as HTMLAnchorElement).href =
      `/bookings/new?vehicle=${vehicle}&at=${at}`;
    (document.getElementById('cal-pop-block') as HTMLAnchorElement).href =
      `/blocked-slots?vehicle=${vehicle}&from=${at}`;

    const sr = scroller.getBoundingClientRect();
    const x = e.detail === 0 ? rect.left + 24 : e.clientX;
    pop.style.left = `${Math.max(8, Math.min(x - sr.left + scroller.scrollLeft - 12, scroller.scrollWidth - 272))}px`;
    pop.style.top = `${rect.bottom - sr.top + scroller.scrollTop + 4}px`;
    pop.hidden = false;
    pop.setAttribute('aria-label', `Empty time on ${label}`);
    opener = link;
    document.getElementById('cal-pop-new')!.focus();
  });

  // Week view: click a day cell to open that day.
  if (scroller.dataset.view === 'week') {
    const dates = (scroller.dataset.dates || '').split(',');
    const dayPx = Number(scroller.dataset.dayPx || 150);
    scroller.addEventListener('click', (e) => {
      const track = (e.target as HTMLElement).closest<HTMLElement>('[data-week-track]');
      if (!track) return;
      const idx = Math.floor((e.clientX - track.getBoundingClientRect().left) / dayPx);
      const date = dates[idx];
      if (!date) return;
      const p = new URLSearchParams(location.search);
      p.set('view', 'day');
      p.set('date', date);
      location.assign(`/calendar?${p}`);
    });
  }
}
