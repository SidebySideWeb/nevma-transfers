type FormStrings = {
  sending: string;
  submit: string;
  errorGeneric: string;
  errorRequired: string;
  errorEmail: string;
  errorSummary: string;
};

const DEFAULT_STRINGS: FormStrings = {
  sending: 'Sending…',
  submit: 'Send',
  errorGeneric: 'Error',
  errorRequired: 'Required',
  errorEmail: 'Invalid email',
  errorSummary: 'Please check',
};

function parseStrings(raw: string | undefined): FormStrings {
  try {
    const parsed = JSON.parse(raw || '{}') as Partial<FormStrings>;
    return { ...DEFAULT_STRINGS, ...parsed };
  } catch {
    return { ...DEFAULT_STRINGS };
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function fieldValue(el: Element): string {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') return el.checked ? 'on' : '';
    return el.value.trim();
  }
  if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    return el.value.trim();
  }
  return '';
}

function setFieldError(form: HTMLFormElement, name: string, message: string | null) {
  // V2 EnquiryForm posts one `datetime` built from two inputs; show its error under the time.
  const el = form.elements.namedItem(name === 'datetime' ? 'pickupTime' : name);
  const control =
    el instanceof RadioNodeList ? (el[0] as HTMLElement | undefined) : (el as HTMLElement | null);
  if (!control) return;
  const field = control.closest('.field, .f2');
  const errId = `${name}-err`;
  let err = form.querySelector(`#${CSS.escape(errId)}`) as HTMLElement | null;
  if (message) {
    control.setAttribute('aria-invalid', 'true');
    if (!err) {
      err = document.createElement('span');
      err.className = 'error';
      err.id = errId;
      if (field) field.appendChild(err);
      else (control.closest('label') || control).after(err);
    }
    err.textContent = message;
    if (!control.hasAttribute('aria-describedby')) control.setAttribute('aria-describedby', errId);
  } else {
    control.removeAttribute('aria-invalid');
    if (control.getAttribute('aria-describedby') === errId) control.removeAttribute('aria-describedby');
    err?.remove();
  }
}

function clearErrors(form: HTMLFormElement) {
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  form.querySelectorAll('.error').forEach((el) => {
    if (el.id.endsWith('-err')) el.remove();
  });
  form.querySelector('#form-error-summary')?.remove();
}

function showSummary(form: HTMLFormElement, fields: Record<string, string>, title: string) {
  form.querySelector('#form-error-summary')?.remove();
  const box = document.createElement('div');
  box.className = 'notice notice-danger';
  box.id = 'form-error-summary';
  box.tabIndex = -1;
  box.setAttribute('role', 'alert');
  const strong = document.createElement('strong');
  strong.textContent = title;
  const p = document.createElement('p');
  p.appendChild(strong);
  box.appendChild(p);
  const ul = document.createElement('ul');
  for (const [name, message] of Object.entries(fields)) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    const control = form.elements.namedItem(name === 'datetime' ? 'pickupTime' : name);
    a.href = `#${(control instanceof Element && control.id) || name}`;
    a.textContent = message;
    li.appendChild(a);
    ul.appendChild(li);
  }
  box.appendChild(ul);
  form.prepend(box);
  box.focus();
}

function validateSimple(form: HTMLFormElement, strings: FormStrings): Record<string, string> {
  const fields: Record<string, string> = {};
  const required = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    '[required]',
  );
  required.forEach((el) => {
    const name = el.name;
    if (!name) return;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      if (!el.checked) fields[name] = strings.errorRequired;
      return;
    }
    if (!fieldValue(el)) fields[name] = strings.errorRequired;
  });

  const email = form.elements.namedItem('email');
  if (email instanceof HTMLInputElement && email.value.trim() && !isEmail(email.value.trim())) {
    fields.email = strings.errorEmail;
  }

  const passengers = form.elements.namedItem('passengers');
  if (passengers instanceof HTMLInputElement && passengers.value !== '') {
    const n = Number(passengers.value);
    if (!Number.isInteger(n) || n < 1 || n > 60) fields.passengers = strings.errorRequired;
  }

  const luggage = form.elements.namedItem('luggage');
  if (luggage instanceof HTMLInputElement && luggage.value !== '') {
    const n = Number(luggage.value);
    if (!Number.isInteger(n) || n < 0 || n > 100) fields.luggage = strings.errorRequired;
  }

  const people = form.elements.namedItem('people');
  if (people instanceof HTMLInputElement && people.value !== '') {
    const n = Number(people.value);
    if (!Number.isInteger(n) || n < 1 || n > 1000) fields.people = strings.errorRequired;
  }

  const fromZone = form.elements.namedItem('fromZone');
  if (fromZone instanceof HTMLSelectElement && fromZone.value === 'other') {
    const other = form.elements.namedItem('fromOther');
    if (other instanceof HTMLInputElement && !other.value.trim()) {
      fields.fromOther = strings.errorRequired;
    }
  }
  const toZone = form.elements.namedItem('toZone');
  if (toZone instanceof HTMLSelectElement && toZone.value === 'other') {
    const other = form.elements.namedItem('toOther');
    if (other instanceof HTMLInputElement && !other.value.trim()) {
      fields.toOther = strings.errorRequired;
    }
  }

  const invoice = form.elements.namedItem('invoice');
  if (invoice instanceof HTMLInputElement && invoice.checked) {
    for (const name of ['invoiceCompany', 'invoiceVat', 'invoiceTaxOffice', 'invoiceAddress']) {
      const el = form.elements.namedItem(name);
      if (el instanceof HTMLInputElement && !el.value.trim()) {
        fields[name] = strings.errorRequired;
      }
    }
  }

  return fields;
}

function syncOther(select: HTMLSelectElement) {
  const targetId = select.dataset.otherTarget;
  if (!targetId) return;
  const wrap = document.getElementById(targetId);
  if (!wrap) return;
  wrap.hidden = select.value !== 'other';
}

function syncInvoice(form: HTMLFormElement) {
  const toggle = form.querySelector<HTMLInputElement>('[data-invoice-toggle]');
  const fields = form.querySelector<HTMLElement>('#invoice-fields');
  if (!toggle || !fields) return;
  fields.hidden = !toggle.checked;
}

function prefillTransfer(form: HTMLFormElement) {
  if (form.dataset.temForm !== 'transfer-request') return;
  const q = new URLSearchParams(window.location.search);
  const from = q.get('from');
  const to = q.get('to');
  const classKey = q.get('class');
  const fromEl = form.elements.namedItem('fromZone');
  const toEl = form.elements.namedItem('toZone');
  const classEl = form.elements.namedItem('vehicleClass');
  if (from && fromEl instanceof HTMLSelectElement) {
    if ([...fromEl.options].some((o) => o.value === from)) {
      fromEl.value = from;
      syncOther(fromEl);
    }
  }
  if (to && toEl instanceof HTMLSelectElement) {
    if ([...toEl.options].some((o) => o.value === to)) {
      toEl.value = to;
      syncOther(toEl);
    }
  }
  if (classKey && classEl instanceof HTMLSelectElement) {
    if ([...classEl.options].some((o) => o.value === classKey)) {
      classEl.value = classKey;
    }
  }
}

function enhance(form: HTMLFormElement) {
  const strings = parseStrings(form.dataset.strings);
  const submitBtn = form.querySelector<HTMLButtonElement>('[data-submit]');

  form.querySelectorAll<HTMLSelectElement>('select[data-other-target]').forEach((sel) => {
    syncOther(sel);
    sel.addEventListener('change', () => syncOther(sel));
  });
  syncInvoice(form);
  form.querySelector('[data-invoice-toggle]')?.addEventListener('change', () => syncInvoice(form));

  prefillTransfer(form);

  form.addEventListener('blur', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement))
      return;
    if (!t.name) return;
    const fields = validateSimple(form, strings);
    setFieldError(form, t.name, fields[t.name] ?? null);
  }, true);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clearErrors(form);
    const local = validateSimple(form, strings);
    if (Object.keys(local).length) {
      for (const [k, msg] of Object.entries(local)) setFieldError(form, k, msg);
      showSummary(form, local, strings.errorSummary);
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = strings.sending;
    }

    try {
      const body = new FormData(form);
      const res = await fetch(form.action, {
        method: 'POST',
        body,
        headers: { Accept: 'application/json' },
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        redirect?: string;
        fields?: Record<string, string>;
        message?: string;
      } | null;

      if (res.ok && data?.ok && data.redirect) {
        window.location.href = data.redirect;
        return;
      }

      if (res.status === 400 && data?.fields) {
        for (const [k, msg] of Object.entries(data.fields)) setFieldError(form, k, msg);
        showSummary(form, data.fields, strings.errorSummary);
      } else {
        showSummary(form, { form: data?.message || strings.errorGeneric }, strings.errorSummary);
      }
    } catch {
      showSummary(form, { form: strings.errorGeneric }, strings.errorSummary);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = strings.submit;
      }
    }
  });
}

document.querySelectorAll<HTMLFormElement>('form[data-tem-form]').forEach(enhance);
