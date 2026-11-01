import 'server-only';

/** Copied from design/tokens.css - emails cannot use CSS variables. */
export const emailTheme = {
  bg: '#0a0a0b',
  surface: '#111315',
  border: '#cfa45f',
  text: '#f4f0e6',
  muted: '#a9a395',
  accent: '#e7c687',
  font: 'Jost, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  maxWidth: '600px',
} as const;
