import 'server-only';

/** Copied from design/tokens.css - emails cannot use CSS variables. */
export const emailTheme = {
  bg: '#0e1116',
  surface: '#161b22',
  border: '#2f3a47',
  text: '#f3f4f6',
  muted: '#a7b0bc',
  accent: '#c9a86a',
  font: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  maxWidth: '600px',
} as const;
