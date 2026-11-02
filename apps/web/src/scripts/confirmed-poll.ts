/**
 * Polls GET /api/booking-status until confirmed (or 2 minutes).
 * Waiting lead stays in the hero; on confirm the page reloads to render the full V2 body.
 */
type StatusPayload = {
  reference?: string;
  status?: string;
  paymentStatus?: string;
};

const confirmedRoot = document.getElementById('confirmed-root');
if (confirmedRoot?.dataset.pending === '1') {
  const orderCode = confirmedRoot.dataset.orderCode ?? '';
  const waitingEl = document.getElementById('confirmed-waiting');
  const timeoutEl = document.getElementById('confirmed-timeout');
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
          window.location.reload();
          return;
        }
      }
    } catch {
      /* keep polling */
    }

    if (Date.now() - started >= maxMs) {
      waitingEl?.setAttribute('hidden', '');
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
