import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  compactFlightNumber,
  createFlightProvider,
  createManualAdapter,
  etaMovedEnough,
  normalizeFlightNumber,
  parseAerodatabox,
  parseFlightaware,
  parseManual,
  pickupBufferMin,
  shouldPollFlight,
  suggestedPickupAt,
} from '../src/index.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const adb = JSON.parse(readFileSync(join(dir, 'fixtures/aerodatabox-a3603.json'), 'utf8'));
const fa = JSON.parse(readFileSync(join(dir, 'fixtures/flightaware-a3603.json'), 'utf8'));

describe('normalizeFlightNumber', () => {
  it('A3603 = A3 603', () => {
    assert.equal(normalizeFlightNumber('A3603'), 'A3 603');
    assert.equal(normalizeFlightNumber('a3 603'), 'A3 603');
    assert.equal(normalizeFlightNumber('A3-603'), 'A3 603');
    assert.equal(compactFlightNumber('A3 603'), 'A3603');
  });
});

describe('provider parsing fixtures', () => {
  it('aerodatabox delayed arrival', () => {
    const r = parseAerodatabox(adb);
    assert.equal(r.found, true);
    assert.equal(r.status, 'delayed');
    assert.equal(r.origin, 'SKG');
    assert.equal(r.originCountry, 'GR');
    assert.equal(r.terminal, '1');
    assert.equal(r.schedArr, '2026-11-08T16:30:00.000Z');
    assert.equal(r.eta, '2026-11-08T17:10:00.000Z');
  });

  it('flightaware delayed arrival', () => {
    const r = parseFlightaware(fa, '2026-11-08');
    assert.equal(r.found, true);
    assert.equal(r.status, 'delayed');
    assert.equal(r.origin, 'SKG');
    assert.equal(r.terminal, '1');
    assert.equal(r.eta, '2026-11-08T17:10:00.000Z');
  });

  it('manual always found with empty times', () => {
    const r = parseManual();
    assert.equal(r.found, true);
    assert.equal(r.schedArr, null);
    assert.equal(createManualAdapter().name, 'manual');
  });

  it('createFlightProvider(manual) lookup', async () => {
    const p = createFlightProvider({ provider: 'manual' });
    const r = await p.lookup({ number: 'A3603', date: '2026-11-08' });
    assert.equal(r.found, true);
  });
});

describe('polling schedule', () => {
  it('skips landed; 30 min then 10 min intervals', () => {
    assert.equal(shouldPollFlight({ flightStatus: 'landed', arrivalAt: new Date() }).poll, false);

    const arrival = new Date('2026-11-08T18:00:00Z');
    const far = new Date(arrival.getTime() - 5 * 3600_000);
    const near = new Date(arrival.getTime() - 2 * 3600_000);

    const a = shouldPollFlight({
      flightStatus: 'scheduled',
      arrivalAt: arrival,
      lastCheckedAt: null,
      now: far,
    });
    assert.equal(a.poll, true);
    assert.equal(a.intervalMin, 30);

    const b = shouldPollFlight({
      flightStatus: 'delayed',
      arrivalAt: arrival,
      lastCheckedAt: new Date(far.getTime() - 5 * 60_000),
      now: far,
    });
    assert.equal(b.poll, false);

    const c = shouldPollFlight({
      flightStatus: 'delayed',
      arrivalAt: arrival,
      lastCheckedAt: null,
      now: near,
    });
    assert.equal(c.poll, true);
    assert.equal(c.intervalMin, 10);
  });
});

describe('buffers and ETA threshold', () => {
  it('domestic 15 / international 30; suggest pickup', () => {
    assert.equal(pickupBufferMin('GR'), 15);
    assert.equal(pickupBufferMin('DE'), 30);
    const p = suggestedPickupAt('2026-11-08T16:30:00Z', 30);
    assert.equal(p.toISOString(), '2026-11-08T17:00:00.000Z');
  });

  it('etaMovedEnough 15 min threshold', () => {
    assert.equal(
      etaMovedEnough('2026-11-08T16:30:00Z', '2026-11-08T16:40:00Z', 15),
      false,
    );
    assert.equal(
      etaMovedEnough('2026-11-08T16:30:00Z', '2026-11-08T16:50:00Z', 15),
      true,
    );
  });
});
