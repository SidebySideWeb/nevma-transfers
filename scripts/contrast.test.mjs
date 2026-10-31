import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = Object.fromEntries(
  [...readFileSync(join(root, 'design', 'tokens.css'), 'utf8').matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]),
);

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [x, y] = [lum(tokens[a]), lum(tokens[b])].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Text/background pairs the wireframes and apps use. 4.5:1 for body text.
const pairs = [
  ['color-text', 'color-bg'], ['color-text', 'color-surface'], ['color-text', 'color-surface-2'],
  ['color-muted', 'color-bg'], ['color-muted', 'color-surface'], ['color-muted', 'color-surface-2'],
  ['color-accent', 'color-bg'], ['color-accent', 'color-surface'], ['color-accent', 'color-surface-2'],
  ['color-accent-text', 'color-accent'], ['color-accent-text', 'color-accent-strong'],
  ['color-danger', 'color-surface'], ['color-danger', 'color-surface-2'], ['color-success', 'color-surface-2'],
  ['color-warning', 'color-surface-2'], ['color-warning', 'color-bg'],
];

test('every text/background token pair meets WCAG AA 4.5:1', () => {
  for (const [fg, bg] of pairs) {
    assert.ok(tokens[fg] && tokens[bg], `missing token ${fg} or ${bg}`);
    const r = ratio(fg, bg);
    assert.ok(r >= 4.5, `${fg} on ${bg} is ${r.toFixed(2)}:1`);
  }
});

test('wireframes use tokens only: no hex colours in design/screens', () => {
  const dir = join(root, 'design', 'screens');
  const files = readdirSync(dir).filter((f) => /\.(html|css)$/.test(f));
  assert.ok(files.length >= 13, 'expected the screens and screens.css');
  for (const f of files) {
    const body = readFileSync(join(dir, f), 'utf8');
    assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b(?![\w-]*=)/, `${f} contains a hex colour`);
  }
});

test('no NEVMA branding in the design', () => {
  for (const f of readdirSync(join(root, 'design', 'screens'))) {
    assert.doesNotMatch(readFileSync(join(root, 'design', 'screens', f), 'utf8'), /nevma/i, f);
  }
});
