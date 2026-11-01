import { t, type UiStringKey } from '../strings';

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Like `t()`, but turns *words* into <em>words</em> after escaping.
 * Returns an HTML string safe for `set:html`.
 */
export function tAccent(key: UiStringKey, vars?: Record<string, string | number>): string {
  const raw = t(key, vars);
  const escaped = escapeHtml(raw);
  return escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

export function escapeThenAccent(text: string): string {
  return escapeHtml(text).replace(/\*([^*]+)\*/g, '<em>$1</em>');
}
