/**
 * Polls GET /api/booking-status until confirmed (or 2 minutes).
 * Mutates the DOM: waiting → confirmed, or waiting → timeout.
 */
type StatusPayload = {
  reference?: string;
  status?: string;
  paymentStatus?: string;
};

const root = document.getElementById('confirmed-root');
if (root) {
  const orderCode = root.dataset.orderCode ?? '';
  const waitingEl = document.getElementById('confirmed-waiting');
  const okEl = document.getElementById('confirmed-ok');
  const timeoutEl = document.getElementById('confirmed-timeout');
  const bodyEl = document.getElementById('confirmed-body');
  const titleEl = document.getElementById('confirmed-title');
  const bodyTemplate = root.dataset.bodyTemplate ?? '';
  const pollMs = 3000;
  const maxMs = 120_000;
  const started = Date.now();

  async function poll(): Promise<void> {
    if (!orderCode) return;
    try {
      const res = await fetch(`/api/booking-status?s=${encodeURIComponent(orderCode)}`, {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (res.ok) {
        const data = (await res.json()) as StatusPayload;
        if (data.status === 'confirmed' || data.status === 'assigned' || data.status === 'completed') {
          if (bodyEl && data.reference) {
            bodyEl.textContent = bodyTemplate.replace(/\{reference\}/g, data.reference);
          }
          waitingEl?.setAttribute('hidden', '');
          timeoutEl?.setAttribute('hidden', '');
          okEl?.removeAttribute('hidden');
          titleEl?.focus();
          return;
        }
      }
    } catch {
      /* keep polling */
    }

    if (Date.now() - started >= maxMs) {
      waitingEl?.setAttribute('hidden', '');
      okEl?.setAttribute('hidden', '');
      timeoutEl?.removeAttribute('hidden');
      document.getElementById('confirmed-timeout-title')?.focus();
      return;
    }

    window.setTimeout(() => {
      void poll();
    }, pollMs);
  }

  void poll();
}
