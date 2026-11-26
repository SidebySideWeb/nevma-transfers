import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AREAS, areaBounds, inServiceArea, pointArea, pointInRing } from '../src/index.mjs';

describe('inServiceArea (expanded Attica / Central Greece / Peloponnese / Cyclades)', () => {
  const inside = [
    ['Syntagma', 37.9755, 23.7348],
    ['Airport LGAV', 37.9364, 23.9445],
    ['Varoulko Seaside (Mikrolimano)', 37.937288, 23.658509],
    ['Corinth', 37.9386, 22.9322],
    ['Nafplio', 37.567, 22.805],
    ['Patras', 38.2466, 21.7346],
    ['Kalamata', 37.0389, 22.1142],
    ['Lamia', 38.899, 22.433],
    ['Delphi', 38.4824, 22.501],
    ['Chalkida', 38.4625, 23.599],
    ['Aegina town', 37.7467, 23.4903],
    ['Mykonos town', 37.4467, 25.3289],
    ['Santorini Fira', 36.4166, 25.4324],
    ['Naxos', 37.105, 25.376],
    ['Kifisia', 38.074, 23.811],
    ['Sounio', 37.6509, 24.0265],
  ];
  const outside = [
    ['Thessaloniki', 40.6401, 22.9444],
    ['Volos', 39.366, 22.945],
    ['Skiathos', 39.165, 23.49],
    ['Crete Heraklion', 35.3387, 25.1442],
    ['Rhodes town', 36.4349, 28.2176],
    ['Samos', 37.7548, 26.9778],
    ['Corfu town', 39.6243, 19.9217],
    ['Zakynthos', 37.787, 20.898],
  ];

  for (const [name, lat, lng] of inside) {
    it(`inside: ${name}`, () => {
      assert.equal(inServiceArea({ lat, lng }), true);
    });
  }

  for (const [name, lat, lng] of outside) {
    it(`outside: ${name}`, () => {
      assert.equal(inServiceArea({ lat, lng }), false);
    });
  }

  it('point exactly on an edge (vertex) is inside', () => {
    const [lng, lat] = AREAS.attica.ring[0];
    assert.equal(inServiceArea({ lat, lng }), true);
  });

  it('point mid-edge is inside', () => {
    const [lng1, lat1] = AREAS.attica.ring[0];
    const [lng2, lat2] = AREAS.attica.ring[1];
    const lat = (lat1 + lat2) / 2;
    const lng = (lng1 + lng2) / 2;
    assert.equal(pointInRing(lat, lng, AREAS.attica.ring), true);
  });
});

describe('areaBounds', () => {
  it('returns Google rectangle covering the expanded service area', () => {
    const b = areaBounds('attica');
    assert.ok(b.low.latitude < b.high.latitude);
    assert.ok(b.low.longitude < b.high.longitude);
    // Syntagma and Santorini inside bbox
    assert.ok(37.9755 >= b.low.latitude && 37.9755 <= b.high.latitude);
    assert.ok(23.7348 >= b.low.longitude && 23.7348 <= b.high.longitude);
    assert.ok(36.4166 >= b.low.latitude && 36.4166 <= b.high.latitude);
    assert.ok(25.4324 >= b.low.longitude && 25.4324 <= b.high.longitude);
    // Crete / Corfu outside bbox extremes we care about
    assert.ok(35.34 < b.low.latitude || 25.14 > b.high.longitude);
  });
});

describe('pointArea', () => {
  it('returns matching name', () => {
    const name = pointArea({ lat: 37.9755, lng: 23.7348 }, {
      attica: AREAS.attica,
      nowhere: { ring: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]] },
    });
    assert.equal(name, 'attica');
  });

  it('returns null when none match', () => {
    assert.equal(
      pointArea({ lat: 40.64, lng: 22.94 }, { attica: AREAS.attica }),
      null,
    );
  });
});
