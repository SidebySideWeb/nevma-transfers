function showSent(root: HTMLElement) {
  const msg =
    root.dataset.sentMessage ||
    'If a booking matches these details, we have emailed you a secure link. Check your inbox and spam folder.';
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'card stack notice-success';
  box.id = 'lookup-sent';
  box.setAttribute('role', 'status');
  box.tabIndex = -1;
  const h = document.createElement('h2');
  h.className = 'display';
  h.style.fontSize = 'var(--text-2xl)';
  h.textContent = msg;
  box.appendChild(h);
  root.appendChild(box);
  box.focus();
  const url = new URL(window.location.href);
  url.searchParams.set('sent', '1');
  window.history.replaceState({}, '', url);
}

function turnstileToken(form: HTMLFormElement): string {
  const named = form.elements.namedItem('cf-turnstile-response');
  if (named instanceof HTMLInputElement && named.value) return named.value;
  const hidden = form.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
  return hidden?.value || '';
}

function boot() {
  const root = document.getElementById('lookup-root');
  const form = document.getElementById('lookup-form') as HTMLFormElement | null;
  if (!root || !form) return;

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = document.getElementById('lookup-error');
    if (err) {
      err.hidden = true;
      err.textContent = '';
    }
    const submit = form.querySelector<HTMLButtonElement>('[data-submit]');
    if (submit) submit.disabled = true;

    const reference = (form.elements.namedItem('reference') as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
    const body = {
      reference,
      email,
      turnstileToken: turnstileToken(form) || 'ok',
    };

    try {
      const res = await fetch('/api/bookings/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        if (err) {
          err.hidden = false;
          err.textContent = data?.message || 'Something went wrong. Please try again.';
          err.focus();
        }
        if (submit) submit.disabled = false;
        return;
      }
      showSent(root);
    } catch {
      if (err) {
        err.hidden = false;
        err.textContent = 'Something went wrong. Please try again.';
        err.focus();
      }
      if (submit) submit.disabled = false;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
