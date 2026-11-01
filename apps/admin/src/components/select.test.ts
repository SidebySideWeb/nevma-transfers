/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { enhanceSelect, refreshSelect, resetSelectIds } from './enhance-select';

function mountSelect(html: string): HTMLSelectElement {
  document.body.innerHTML = html;
  const sel = document.querySelector('select')!;
  enhanceSelect(sel);
  return sel;
}

function btn(): HTMLButtonElement {
  return document.querySelector('.ep-select-btn')!;
}

function key(el: HTMLElement, key: string, opts: KeyboardEventInit = {}) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
}

describe('Select', () => {
  beforeEach(() => {
    resetSelectIds();
    document.body.innerHTML = '';
  });

  it('opens with ArrowDown, moves, type-ahead finds, Enter picks native select', () => {
    const sel = mountSelect(`
      <label for="s">Class</label>
      <select id="s" class="input">
        <option value="a">Alpha</option>
        <option value="b">Bravo</option>
        <option value="c">Charlie</option>
      </select>
    `);
    expect(sel.selectedIndex).toBe(0);
    const b = btn();
    key(b, 'ArrowDown');
    expect(b.getAttribute('aria-expanded')).toBe('true');
    key(b, 'ArrowDown');
    key(b, 'c');
    key(b, 'Enter');
    expect(sel.value).toBe('c');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(b.textContent).toBe('Charlie');
  });

  it('Escape closes without changing the native select', () => {
    const sel = mountSelect(`
      <select id="s" class="input">
        <option value="a" selected>Alpha</option>
        <option value="b">Bravo</option>
      </select>
    `);
    const b = btn();
    key(b, 'ArrowDown');
    key(b, 'ArrowDown');
    key(b, 'Escape');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(sel.value).toBe('a');
  });

  it('disabled options cannot be picked', () => {
    const sel = mountSelect(`
      <select id="s" class="input">
        <option value="a" selected>Alpha</option>
        <option value="b" disabled data-meta="0 free">Bravo</option>
        <option value="c">Charlie</option>
      </select>
    `);
    const b = btn();
    key(b, 'ArrowDown');
    key(b, 'ArrowDown'); // Bravo (disabled)
    key(b, 'Enter');
    expect(sel.value).toBe('a');
    expect(b.getAttribute('aria-expanded')).toBe('true');
  });
  it('refreshSelect rebuilds the dropdown for new options and keeps the label link', () => {
    const sel = mountSelect(`
      <label for="s">Class</label>
      <select id="s" class="input"><option value="a">Alpha</option></select>
    `);
    sel.innerHTML = '<option value="x" data-meta="1 free · € 70.00">Xray</option><option value="y" disabled data-meta="0 free">Yankee</option>';
    refreshSelect(sel);
    expect(document.querySelectorAll('.ep-select')).toHaveLength(1);
    expect(btn().textContent).toBe('Xray');
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(document.querySelector('label')!.htmlFor).toBe(btn().id);
    expect(document.querySelector('[role="option"]:nth-child(2)')!.getAttribute('aria-disabled')).toBe('true');
  });});
