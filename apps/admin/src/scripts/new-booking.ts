import { actions } from 'astro:actions';
import { refreshSelect } from '../components/enhance-select';
import { eurosToCents, formatEuro } from '../lib/money';

/** New booking form: customer lookup, live class availability and price hint, submit. */

type Offer = {
  key: string;
  name: string;
  free: number;
  priceCents: number | null;
  fits: boolean;
};
type Hit = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  vat: string | null;
  tax_office: string | null;
  address: string | null;
  bookings_count: number;
  last_booking_at: string | null;
};
type PageData = {
  vehicleId: string;
  extras: { code: string; name: string; priceCents: number }[];
  customer?: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    company: string | null;
    vat: string | null;
    tax_office: string | null;
    address: string | null;
  } | null;
};

const data = JSON.parse(document.getElementById('nb-data')!.textContent || '{}') as PageData;
const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('nb-form');
const idempotencyKey = crypto.randomUUID();

const checked = (name: string) => form.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
const type = () => (checked('nb-type')?.value ?? 'transfer') as 'transfer' | 'hourly';
const payment = () => (checked('nb-pay')?.value ?? 'link') as 'link' | 'offline_paid' | 'offline_collect';
const selectedText = (id: string) => ($<HTMLSelectElement>(id).selectedOptions[0]?.textContent ?? '').trim();

// ---------- errors next to fields ----------
function controls(id: string): HTMLElement[] {
  const el = $(id);
  const btn = el.closest('.ep-select')?.querySelector<HTMLElement>('.ep-select-btn');
  return btn ? [el, btn] : [el];
}
function setError(id: string, message: string | null) {
  const p = document.getElementById(`${id}-err`);
  if (p) {
    p.textContent = message ?? '';
    p.hidden = !message;
  }
  for (const c of controls(id)) {
    if (message) c.setAttribute('aria-invalid', 'true');
    else c.removeAttribute('aria-invalid');
  }
}
function clearErrors() {
  form.querySelectorAll<HTMLElement>('.error-text').forEach((p) => {
    p.hidden = true;
    p.textContent = '';
  });
  form.querySelectorAll('[aria-invalid]').forEach((c) => c.removeAttribute('aria-invalid'));
  $('nb-error').hidden = true;
}
function showBanner(message: string) {
  $('nb-error-text').textContent = message;
  $('nb-error').hidden = false;
}
function focusField(id: string) {
  const [native, btn] = controls(id);
  (btn ?? native)?.focus();
}

// ---------- customer lookup (debounced 250 ms) ----------
const find = $('nb-find');
const list = $<HTMLUListElement>('nb-find-list');
let hits: Hit[] = [];
let active = -1;
let lookupSeq = 0;
let lookupTimer: ReturnType<typeof setTimeout> | undefined;
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Athens' });

function closeList() {
  list.hidden = true;
  find.setAttribute('aria-expanded', 'false');
  find.removeAttribute('aria-activedescendant');
  active = -1;
}
function markActive() {
  list.querySelectorAll('[role="option"]').forEach((li, i) => {
    li.classList.toggle('is-active', i === active);
    li.setAttribute('aria-selected', String(i === active));
    if (i === active) find.setAttribute('aria-activedescendant', li.id);
  });
  if (active < 0) find.removeAttribute('aria-activedescendant');
}
function renderList(q: string) {
  const items = hits.map((h, i) => {
    const li = document.createElement('li');
    li.id = `nb-cu-${i}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.dataset.index = String(i);
    const strong = document.createElement('strong');
    strong.textContent = h.name;
    const meta = document.createElement('span');
    meta.className = 'ep-opt-meta';
    const last = h.last_booking_at ? ` · last ${day.format(new Date(h.last_booking_at))}` : '';
    meta.textContent = `${h.email} · ${h.bookings_count} booking${h.bookings_count === 1 ? '' : 's'}${last}`;
    li.append(strong, meta);
    return li;
  });
  const add = document.createElement('li');
  add.id = 'nb-cu-new';
  add.className = 'new';
  add.setAttribute('role', 'option');
  add.setAttribute('aria-selected', 'false');
  add.dataset.index = String(hits.length);
  add.textContent = `+ New customer "${q}"`;
  list.replaceChildren(...items, add);
  list.hidden = false;
  find.setAttribute('aria-expanded', 'true');
  active = -1;
  $('nb-find-status').textContent = `${hits.length} matching customer${hits.length === 1 ? '' : 's'}`;
}
async function runLookup() {
  const q = find.value.trim();
  if (q.length < 2) return closeList();
  const mine = ++lookupSeq;
  const { data: found, error } = await actions.searchCustomers({ query: q });
  if (mine !== lookupSeq) return;
  if (error) return closeList();
  hits = found as Hit[];
  renderList(q);
}
function applyCustomer(hit: {
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  vat: string | null;
  tax_office: string | null;
  address: string | null;
}) {
  $('nb-name').value = hit.name;
  $('nb-mail').value = hit.email;
  $('nb-tel').value = hit.phone ?? '';
  $('nb-inv-company').value = hit.company ?? '';
  $('nb-inv-vat').value = hit.vat ?? '';
  $('nb-inv-tax').value = hit.tax_office ?? '';
  $('nb-inv-addr').value = hit.address ?? '';
  if (hit.company) $<HTMLDetailsElement>('nb-inv').open = true;
  find.value = hit.name;
  closeList();
}

function pick(i: number) {
  const hit = hits[i];
  if (hit) {
    applyCustomer(hit);
    return;
  }
  // "+ New customer": use what was typed
  const typed = find.value.trim();
  $('nb-name').value = '';
  $('nb-mail').value = '';
  $('nb-tel').value = '';
  if (typed.includes('@')) $('nb-mail').value = typed;
  else if (/^[+\d][\d\s()+-]{4,}$/.test(typed)) $('nb-tel').value = typed;
  else $('nb-name').value = typed;
  closeList();
  $('nb-name').focus();
}
find.addEventListener('input', () => {
  clearTimeout(lookupTimer);
  lookupTimer = setTimeout(runLookup, 250);
});
find.addEventListener('keydown', (e) => {
  const open = !list.hidden;
  const n = hits.length + 1;
  if (e.key === 'ArrowDown' && open) {
    e.preventDefault();
    active = (active + 1) % n;
    markActive();
  } else if (e.key === 'ArrowUp' && open) {
    e.preventDefault();
    active = (active - 1 + n) % n;
    markActive();
  } else if (e.key === 'Enter') {
    e.preventDefault(); // never submit the booking from the search box
    if (open && active >= 0) pick(active);
  } else if (e.key === 'Escape' && open) {
    e.preventDefault();
    closeList();
  }
});
list.addEventListener('mousedown', (e) => e.preventDefault());
list.addEventListener('click', (e) => {
  const li = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
  if (li) pick(Number(li.dataset.index));
});
document.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('.lookup')) closeList();
});

// ---------- trip, class availability, vehicles ----------
let offers: Offer[] = [];
let durationMinutes = 0;
let wantVehicle = data.vehicleId;
let availTimer: ReturnType<typeof setTimeout> | undefined;
let availSeq = 0;
let vehSeq = 0;

function pickupLocal(): string {
  const d = $('nb-date').value;
  const t = $('nb-time').value;
  return d && t ? `${d}T${t}` : '';
}
function tripInput() {
  const from = $('nb-from').value;
  const to = $('nb-to').value;
  const hours = Number($('nb-hours').value);
  const passengers = Number($('nb-px').value);
  const luggage = Number($('nb-lg').value);
  if (!pickupLocal() || !from) return null;
  if (!Number.isInteger(passengers) || passengers < 1 || !Number.isInteger(luggage) || luggage < 0) return null;
  if (type() === 'transfer') {
    if (!to || to === from) return null;
    return { pickupLocal: pickupLocal(), type: 'transfer' as const, fromZone: from, toZone: to, passengers, luggage };
  }
  if (!Number.isInteger(hours) || hours < 1) return null;
  return { pickupLocal: pickupLocal(), type: 'hourly' as const, fromZone: from, hours, passengers, luggage };
}

function opt(value: string, label: string, meta?: string, disabled = false, selected = false) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  if (meta) o.dataset.meta = meta;
  o.disabled = disabled;
  o.selected = selected;
  return o;
}

function timeWindow(): string {
  const [h, m] = $('nb-time').value.split(':').map(Number);
  const start = (h ?? 0) * 60 + (m ?? 0);
  const end = (start + durationMinutes) % 1440;
  const f = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
  return `${f(start)}–${f(end)}`;
}

function rebuildClasses() {
  const sel = $<HTMLSelectElement>('nb-cls');
  const prev = sel.value;
  const options = offers.map((o) => {
    const closed = o.free < 1 || !o.fits || o.priceCents == null;
    const meta =
      o.free < 1
        ? '0 free'
        : !o.fits
          ? 'too small'
          : o.priceCents == null
            ? 'no price'
            : `${o.free} free · ${formatEuro(o.priceCents)}`;
    return opt(o.key, o.name, meta, closed, !closed && o.key === prev);
  });
  sel.replaceChildren(opt('', 'Choose a class', undefined, false, !options.some((o) => o.selected)), ...options);
  refreshSelect(sel);
  $('nb-cls-help').textContent = `Free vehicles for ${timeWindow()}, buffers included.`;
  setError('nb-cls', null);
}

async function loadAvailability() {
  const mine = ++availSeq;
  const trip = tripInput();
  if (!trip) {
    offers = [];
    durationMinutes = 0;
    $('nb-cls-help').textContent = 'Fill in the trip and time to see free vehicles and the list price.';
    renderSummary();
    return loadVehicles();
  }
  const { data: res, error } = await actions.classAvailabilityForTrip(trip);
  if (mine !== availSeq) return;
  if (error) {
    offers = [];
    durationMinutes = 0;
    $('nb-cls-help').textContent = error.message;
    renderSummary();
    return;
  }
  offers = res.classes;
  durationMinutes = res.durationMinutes;
  rebuildClasses();
  renderSummary();
  await loadVehicles();
}
function scheduleAvailability() {
  clearTimeout(availTimer);
  availTimer = setTimeout(loadAvailability, 250);
}

let soloActiveCount = 0;

function updateSoloVehicleHint() {
  const hint = $('nb-veh-auto');
  const sel = $<HTMLSelectElement>('nb-veh');
  const show = soloActiveCount === 1 && !sel.value;
  hint.hidden = !show;
  hint.textContent = show
    ? 'The vehicle is assigned automatically (only one in this class)'
    : '';
}

async function loadVehicles() {
  const mine = ++vehSeq;
  const sel = $<HTMLSelectElement>('nb-veh');
  const classKey = $('nb-cls').value;
  let vehicles: { id: string; label: string; free: boolean }[] = [];
  if (classKey && durationMinutes && pickupLocal()) {
    const { data: res } = await actions.freeVehiclesForClass({
      classKey,
      pickupLocal: pickupLocal(),
      durationMinutes,
    });
    if (mine !== vehSeq) return;
    vehicles = res ?? [];
  }
  const prev = sel.value || wantVehicle;
  const options = vehicles.map((v) =>
    opt(v.id, v.label, v.free ? 'free' : 'busy', !v.free, v.free && v.id === prev),
  );
  sel.replaceChildren(opt('', 'Assign later', undefined, false, !options.some((o) => o.selected)), ...options);
  // Keep the calendar's vehicle pending until a real list has been shown.
  if (vehicles.length) wantVehicle = '';
  refreshSelect(sel);
  setError('nb-veh', null);
  soloActiveCount = vehicles.length;
  updateSoloVehicleHint();
}

// ---------- summary, price override, submit label ----------
function overrideCents(): number | null {
  if (!$('nb-ovr').checked) return null;
  try {
    const c = eurosToCents($('nb-ov').value);
    return c >= 0 ? c : null;
  } catch {
    return null;
  }
}
function row(label: string, amount: string, cls?: string) {
  const wrap = document.createElement('div');
  if (cls) wrap.className = cls;
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = amount;
  wrap.append(dt, dd);
  return wrap;
}
function listTotal(): number | null {
  const o = offers.find((x) => x.key === $('nb-cls').value);
  if (!o || o.priceCents == null) return null;
  let total = o.priceCents;
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="nb-extra"]:checked')) {
    total += data.extras.find((e) => e.code === box.value)?.priceCents ?? 0;
  }
  return total;
}
function renderSummary() {
  const o = offers.find((x) => x.key === $('nb-cls').value);
  const rows: HTMLElement[] = [];
  const total = listTotal();
  if (o && o.priceCents != null) {
    const trip =
      type() === 'hourly'
        ? `${selectedText('nb-from')} · ${$('nb-hours').value} h`
        : `${selectedText('nb-from')} → ${selectedText('nb-to')}`;
    rows.push(row(`${o.name} · ${trip}`, formatEuro(o.priceCents)));
    for (const box of form.querySelectorAll<HTMLInputElement>('input[name="nb-extra"]:checked')) {
      const e = data.extras.find((x) => x.code === box.value);
      if (e) rows.push(row(e.name, formatEuro(e.priceCents)));
    }
  }
  rows.push(row('Price list total', total == null ? '-' : formatEuro(total), 'grand'));
  $('nb-totals').replaceChildren(...rows);

  $('nb-ovr-fields').hidden = !$('nb-ovr').checked;
  const pays = $('nb-pays');
  const ovr = overrideCents();
  pays.replaceChildren();
  const strong = document.createElement('strong');
  strong.style.cssText = 'font:500 1.25rem/1 var(--font-display);color:var(--color-accent)';
  if (ovr != null && total != null && ovr !== total) {
    const was = document.createElement('s');
    was.textContent = formatEuro(total);
    strong.textContent = formatEuro(ovr);
    pays.append(was, ' ', strong);
  } else {
    strong.textContent = ovr != null ? formatEuro(ovr) : total == null ? '-' : formatEuro(total);
    pays.append(strong);
  }
}
function renderPayment() {
  const meth = $<HTMLSelectElement>('nb-meth');
  const offline = payment() !== 'link';
  if (meth.disabled === offline) {
    meth.disabled = !offline;
    refreshSelect(meth);
  }
  $('nb-submit').textContent =
    payment() === 'link'
      ? $('nb-email').checked
        ? 'Create and send payment link'
        : 'Create payment link'
      : payment() === 'offline_paid'
        ? 'Create booking, paid offline'
        : 'Create booking, to collect offline';
}
function renderType() {
  const hourly = type() === 'hourly';
  $('nb-to-field').hidden = hourly;
  $('nb-da-field').hidden = hourly;
  $('nb-hours-field').hidden = !hourly;
}

for (const id of ['nb-from', 'nb-to', 'nb-date', 'nb-time', 'nb-hours', 'nb-px', 'nb-lg']) {
  $(id).addEventListener('input', scheduleAvailability);
  $(id).addEventListener('change', scheduleAvailability);
}
form.querySelectorAll('input[name="nb-type"]').forEach((r) =>
  r.addEventListener('change', () => {
    renderType();
    scheduleAvailability();
  }),
);
$('nb-cls').addEventListener('change', () => {
  setError('nb-cls', null);
  renderSummary();
  void loadVehicles();
});
$('nb-veh').addEventListener('change', updateSoloVehicleHint);
form.querySelectorAll('input[name="nb-extra"], #nb-ovr, #nb-ov').forEach((el) => {
  el.addEventListener('input', renderSummary);
  el.addEventListener('change', renderSummary);
});
form.querySelectorAll('input[name="nb-pay"], #nb-email').forEach((el) =>
  el.addEventListener('change', renderPayment),
);

// ---------- submit ----------
const FIELD: Record<string, string> = {
  classKey: 'nb-cls',
  fromZone: 'nb-from',
  toZone: 'nb-to',
  hours: 'nb-hours',
  vehicleId: 'nb-veh',
  pickupLocal: 'nb-time',
  pickupAddress: 'nb-pa',
  customer: 'nb-name',
  invoice: 'nb-inv-addr',
  priceOverrideEuros: 'nb-ov',
  priceOverrideReason: 'nb-why',
};

function validate(): [string, string][] {
  const errs: [string, string][] = [];
  const need = (id: string, msg: string) => {
    if (!$(id).value.trim()) errs.push([id, msg]);
  };
  need('nb-name', 'Enter the customer name.');
  if (!/^\S+@\S+\.\S+$/.test($('nb-mail').value.trim())) errs.push(['nb-mail', 'Enter a valid e-mail address.']);
  need('nb-tel', 'Enter a phone number.');
  need('nb-from', type() === 'hourly' ? 'Choose the pick-up zone.' : 'Choose the from zone.');
  if (type() === 'transfer') {
    if (!$('nb-to').value) errs.push(['nb-to', 'Choose the to zone.']);
    else if ($('nb-to').value === $('nb-from').value) errs.push(['nb-to', 'Choose a different zone from the pick-up zone.']);
  } else if (!(Number($('nb-hours').value) >= 1)) {
    errs.push(['nb-hours', 'Enter a whole number of hours.']);
  }
  need('nb-date', 'Choose the pick-up date.');
  need('nb-time', 'Choose the pick-up time.');
  need('nb-pa', 'Enter the pick-up address.');
  need('nb-cls', 'Choose a vehicle class with a free vehicle.');
  const inv = ['nb-inv-company', 'nb-inv-vat', 'nb-inv-tax', 'nb-inv-addr'].map((id) => $(id).value.trim());
  if (inv.some(Boolean) && !inv.every(Boolean)) {
    $<HTMLDetailsElement>('nb-inv').open = true;
    errs.push(['nb-inv-addr', 'Fill company, VAT number, tax office and address, or clear all four.']);
  }
  if ($('nb-ovr').checked) {
    if (overrideCents() == null) errs.push(['nb-ov', 'Enter the price in euros, for example 200.00.']);
    need('nb-why', 'A reason is required when the price differs from the list.');
  }
  return errs;
}

function showErrors(errs: [string, string][]) {
  for (const [id, msg] of errs) setError(id, msg);
  if (errs[0]) focusField(errs[0][0]);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();
  const errs = validate();
  if (errs.length) return showErrors(errs);

  const submit = $<HTMLButtonElement>('nb-submit');
  const label = submit.textContent;
  submit.disabled = true;
  submit.textContent = 'Creating…';

  const hourly = type() === 'hourly';
  const inv = ['nb-inv-company', 'nb-inv-vat', 'nb-inv-tax', 'nb-inv-addr'].map((id) => $(id).value.trim());
  const maybe = (v: string) => v.trim() || undefined;
  const { data: res, error } = await actions.createOfficeBooking({
    idempotencyKey,
    customer: {
      name: $('nb-name').value.trim(),
      email: $('nb-mail').value.trim(),
      phone: $('nb-tel').value.trim(),
    },
    bookingType: type(),
    classKey: $('nb-cls').value,
    fromZone: $('nb-from').value,
    toZone: hourly ? undefined : $('nb-to').value,
    hours: hourly ? Number($('nb-hours').value) : undefined,
    pickupLocal: pickupLocal(),
    pickupAddress: $('nb-pa').value,
    dropoffAddress: hourly ? undefined : maybe($('nb-da').value),
    flightNumber: maybe($('nb-fl').value),
    passengers: Number($('nb-px').value),
    luggage: Number($('nb-lg').value),
    extras: [...form.querySelectorAll<HTMLInputElement>('input[name="nb-extra"]:checked')].map((b) => b.value),
    vehicleId: maybe($('nb-veh').value),
    invoice: inv.every(Boolean)
      ? { company: inv[0]!, vat: inv[1]!, taxOffice: inv[2]!, address: inv[3]! }
      : undefined,
    notes: maybe($('nb-notes').value),
    priceOverrideEuros: $('nb-ovr').checked ? $('nb-ov').value : undefined,
    priceOverrideReason: $('nb-ovr').checked ? $('nb-why').value : undefined,
    payment: payment(),
    offlineMethod: payment() === 'link' ? undefined : ($('nb-meth').value as 'cash'),
    emailCustomer: $('nb-email').checked,
  });

  if (res?.ok) {
    const capped = res.vivaTimeoutCapped ? '&capped=1' : '';
    location.assign(`/bookings/${encodeURIComponent(res.reference)}?toast=created${capped}`);
    return;
  }

  submit.disabled = false;
  submit.textContent = label;
  const found: [string, string][] = [];
  if (error) {
    const fields = (error as { fields?: Record<string, string[]> }).fields ?? {};
    for (const [k, msgs] of Object.entries(fields)) {
      if (FIELD[k] && msgs?.[0]) found.push([FIELD[k]!, msgs[0]]);
    }
    if (!found.length) showBanner(error.message || 'The booking could not be created.');
  } else if (res) {
    for (const [k, msg] of Object.entries(res.fields)) {
      if (FIELD[k]) found.push([FIELD[k]!, msg]);
    }
    if (!found.length && (res.code === 'unavailable' || res.code === 'no_price')) {
      found.push(['nb-cls', res.message]);
    }
    if (!found.length) showBanner(res.message);
  }
  showErrors(found);
  if (res && !res.ok && res.code === 'unavailable') void loadAvailability();
});

renderType();
renderPayment();
renderSummary();
if (data.customer) applyCustomer(data.customer);
void loadAvailability();
