import { describe, expect, it } from 'vitest';
import { escapeThenAccent, tAccent } from './accent';
import { setStringOverrides, clearStringOverrides } from '../strings';

describe('tAccent', () => {
  it('escapes HTML and renders *a* as <em>a</em>', () => {
    expect(escapeThenAccent('Hello *world*')).toBe('Hello <em>world</em>');
    expect(escapeThenAccent('<script>x</script> *ok*')).toBe(
      '&lt;script&gt;x&lt;/script&gt; <em>ok</em>',
    );
  });

  it('works through ui string keys', () => {
    setStringOverrides({ 'nav.book': 'Book *now*' } as never);
    expect(tAccent('nav.book')).toBe('Book <em>now</em>');
    clearStringOverrides();
  });
});
