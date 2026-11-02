export {};

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          size?: 'normal' | 'flexible' | 'compact';
          appearance?: 'always' | 'execute' | 'interaction-only';
          execution?: 'render' | 'execute';
          callback?: (token: string) => void;
          'error-callback'?: () => void;
        },
      ) => string;
      execute: (widgetId: string) => void;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
    __TEM_TURNSTILE_TOKEN__?: string;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile_load'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** Obtain a Turnstile token. Tests may set `window.__TEM_TURNSTILE_TOKEN__`. */
export async function getTurnstileToken(siteKey: string): Promise<string> {
  if (typeof window !== 'undefined' && window.__TEM_TURNSTILE_TOKEN__) {
    return window.__TEM_TURNSTILE_TOKEN__;
  }
  await loadScript();
  if (!window.turnstile) throw new Error('turnstile_missing');

  return new Promise((resolve, reject) => {
    const host = document.createElement('div');
    // Keep on-screen: interaction-only stays hidden unless a challenge is required.
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
    // size "invisible" was removed; mode is set on the sitekey in Cloudflare.
    // appearance + execution keep the booking UX quiet until execute().
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
