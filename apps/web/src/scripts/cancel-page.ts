async function getTurnstileToken(siteKey: string): Promise<string> {
  if (window.__TEM_TURNSTILE_TOKEN__) return window.__TEM_TURNSTILE_TOKEN__;
  await new Promise<void>((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile_load'));
    document.head.appendChild(s);
  });
  if (!window.turnstile) throw new Error('turnstile_missing');
  return new Promise((resolve, reject) => {
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.right = '16px';
    host.style.bottom = '16px';
    host.style.zIndex = '9999';
    document.body.appendChild(host);
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      try {
        window.turnstile?.remove(id);
      } catch {
        /* ignore */
      }
      host.remove();
    };
    const ts = window.turnstile;
    if (!ts) {
      reject(new Error('turnstile_missing'));
      return;
    }
    const id = ts.render(host, {
      sitekey: siteKey,
      appearance: 'interaction-only',
      execution: 'execute',
      callback: (token) => finish(() => resolve(token)),
      'error-callback': () => finish(() => reject(new Error('turnstile_failed'))),
    });
    ts.execute(id);
    setTimeout(() => finish(() => reject(new Error('turnstile_timeout'))), 20_000);
  });
}

const cancelRoot = document.getElementById('cancel-root');
const form = document.getElementById('cancel-form');
if (cancelRoot && form instanceof HTMLFormElement) {
  const token = cancelRoot.dataset.token ?? '';
  const siteKey = cancelRoot.dataset.turnstileSiteKey ?? '';
  const errEl = document.getElementById('cancel-error');
  const doneEl = document.getElementById('cancel-done');
  const cardEl = document.getElementById('cancel-card');
  const btn = document.getElementById('cancel-submit');

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!(btn instanceof HTMLButtonElement)) return;
    btn.disabled = true;
    errEl?.setAttribute('hidden', '');
    try {
      const turnstileToken = await getTurnstileToken(siteKey);
      const res = await fetch('/api/bookings/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, turnstileToken }),
      });
      const data = (await res.json()) as { message?: string; status?: string };
      if (!res.ok) {
        throw new Error(data.message || 'cancel_failed');
      }
      cardEl?.setAttribute('hidden', '');
      doneEl?.removeAttribute('hidden');
      document.getElementById('cancel-done-title')?.focus();
    } catch (e) {
      if (errEl) {
        errEl.textContent = e instanceof Error ? e.message : 'error';
        errEl.removeAttribute('hidden');
        errEl.focus();
      }
      btn.disabled = false;
    }
  });
}
