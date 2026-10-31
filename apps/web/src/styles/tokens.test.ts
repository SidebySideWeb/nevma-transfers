import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../..');
const design = readFileSync(resolve(root, 'design/tokens.css'), 'utf8');
const web = readFileSync(resolve(root, 'apps/web/src/styles/tokens.css'), 'utf8');
const admin = readFileSync(resolve(root, 'apps/admin/src/styles/tokens.css'), 'utf8');

describe('tokens.css copies', () => {
  it('keeps apps/web tokens identical to design/tokens.css', () => {
    expect(web).toBe(design);
  });

  it('keeps apps/admin tokens identical to design/tokens.css', () => {
    expect(admin).toBe(design);
  });
});
