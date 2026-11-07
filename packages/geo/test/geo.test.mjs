import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AREAS, areaBounds, inServiceArea, pointArea, pointInRing } from '../src/index.mjs';

describe('inServiceArea (Attica)', () => {
  const inside = [
    ['Syntagma', 37.9755, 23.7348],
    ['Airport LGAV', 37.9364, 23.9445],
    ['Piraeus', 37.942, 23.647],
    ['Kifisia', 38.074, 23.811],
    ['Sounio', 37.6509, 24.0265],
  ];
  const outside = [
    ['Corinth', 37.9386, 22.9322],
    ['Chalkida', 38.4625, 23.599],
    ['Aegina town', 37.7467, 23.4903],
    ['Thessaloniki', 40.6401, 22.9444],
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
  it('returns Google rectangle for attica', () => {
    const b = areaBounds('attica');
    assert.ok(b.low.latitude < b.high.latitude);
    assert.ok(b.low.longitude < b.high.longitude);
    // Syntagma inside bbox
    assert.ok(37.9755 >= b.low.latitude && 37.9755 <= b.high.latitude);
    assert.ok(23.7348 >= b.low.longitude && 23.7348 <= b.high.longitude);
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
