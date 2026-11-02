// Request-form widgets of EnquiryForm (steppers, vehicle chips, VIP switch, invoice disclose).
// They toggle the same classes and ARIA the design shows for each state and keep a hidden
// input in sync so kit 2's forms.ts posts the same field names as before.

/** Selected / unselected class pairs of a vehicle chip, its name and its dot. */
const CHIP: [string, string, string][] = [
  ['', 'seb984', 's26017'],
  ['.se8b49, .sb89d2', 'se8b49', 'sb89d2'],
  ['.s933aa, .s6d5f8', 's933aa', 's6d5f8'],
];

function swap(el: Element | null, on: string, off: string, value: boolean) {
  el?.classList.toggle(on, value);
  el?.classList.toggle(off, !value);
}

document.querySelectorAll<HTMLElement>('.stepper[data-min]').forEach((stepper) => {
  const buttons = [...stepper.querySelectorAll('button')];
  const less = buttons[0];
  const more = buttons[1];
  const out = stepper.querySelector('span');
  const input = stepper.querySelector('input');
  if (!less || !more || !out || !input) return;
  const min = Number(stepper.dataset.min);
  const max = Number(stepper.dataset.max);
  const set = (n: number) => {
    const v = Math.max(min, Math.min(max, n));
    out.textContent = input.value = String(v);
  };
  less.addEventListener('click', () => set(Number(input.value) - 1));
  more.addEventListener('click', () => set(Number(input.value) + 1));
});

document.querySelectorAll<HTMLElement>('[data-vehicle-group]').forEach((group) => {
  const input = group.querySelector<HTMLInputElement>('input[name="vehicleClass"]')!;
  const chips = [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
  const pick = (value: string) => {
    for (const chip of chips) {
      const on = chip.dataset.value === value;
      chip.setAttribute('aria-checked', String(on));
      for (const [sel, a, b] of CHIP) swap(sel ? chip.querySelector(sel) : chip, a, b, on);
    }
    input.value = value;
  };
  chips.forEach((chip) => chip.addEventListener('click', () => pick(chip.dataset.value!)));
  const q = new URLSearchParams(window.location.search).get('class');
  if (q && chips.some((c) => c.dataset.value === q)) pick(q);
});

document.querySelectorAll<HTMLButtonElement>('button[role="switch"].addon').forEach((btn) => {
  const box = btn.nextElementSibling as HTMLInputElement;
  btn.addEventListener('click', () => {
    const on = (box.checked = !box.checked);
    btn.setAttribute('aria-checked', String(on));
    swap(btn, 'sbdbb7', 's651d2', on);
    swap(btn.querySelector('.switch'), 's94d88', 's0c8bc', on);
    swap(btn.querySelector('.switch > span'), 'sba1a6', 's3d884', on);
  });
});

document.querySelectorAll<HTMLButtonElement>('button.disclose').forEach((btn) => {
  const box = btn.nextElementSibling as HTMLInputElement;
  btn.addEventListener('click', () => {
    box.checked = !box.checked;
    btn.setAttribute('aria-expanded', String(box.checked));
    btn.querySelector('span')!.textContent = box.checked ? '−' : '+';
    box.dispatchEvent(new Event('change', { bubbles: true }));
  });
});

document.getElementById('form-error-summary')?.focus();
