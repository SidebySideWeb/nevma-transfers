import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatWhatsappPickup, whatsappDigits, whatsappUrl } from '../src/whatsappUrl.mjs';

describe('whatsappUrl', () => {
  it('builds a wa.me link with encoded spaces, & and Greek text', () => {
    const url = whatsappUrl({
      number: '306900000000',
      text: 'Γεια & hello world',
    });
    assert.ok(url);
    assert.ok(url.startsWith('https://wa.me/306900000000?text='));
    const q = new URL(url).searchParams.get('text');
    assert.equal(q, 'Γεια & hello world');
    assert.ok(url.includes('%26') || decodeURIComponent(url.split('text=')[1]) === 'Γεια & hello world');
  });

  it('returns null for a bad number', () => {
    assert.equal(whatsappUrl({ number: '+30 694' }), null);
    assert.equal(whatsappUrl({ number: '' }), null);
    assert.equal(whatsappUrl({}), null);
    assert.equal(whatsappDigits('abc'), null);
  });

  it('never includes the customer name even when it is passed', () => {
    const url = whatsappUrl({
      number: '306900000000',
      ref: 'EP-7K3QX',
      pickupAt: '2026-11-23T18:34:00+02:00',
      name: 'Secret Customer',
    });
    assert.ok(url);
    const text = decodeURIComponent(url.split('text=')[1]);
    assert.ok(!text.includes('Secret'));
    assert.ok(!text.toLowerCase().includes('customer'));
    assert.ok(text.includes('EP-7K3QX'));
    assert.match(text, /23 Nov, 18:34/);
  });

  it('default text without a booking', () => {
    const url = whatsappUrl({ number: '306900000000' });
    const text = decodeURIComponent(url.split('text=')[1]);
    assert.equal(text, "Hello, I'd like information about a transfer");
  });

  it('normalises Greek national numbers to 30…', () => {
    assert.equal(whatsappDigits('6947333086'), '306947333086');
    assert.equal(whatsappDigits('06947333086'), '306947333086');
    assert.equal(whatsappDigits('+30 694 733 3086'), '306947333086');
  });

  it('formatWhatsappPickup uses Europe/Athens', () => {
    assert.equal(formatWhatsappPickup('2026-11-23T16:34:00.000Z'), '23 Nov, 18:34');
  });
});
