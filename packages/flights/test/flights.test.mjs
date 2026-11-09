import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  compactFlightNumber,
  computeNextFlightCheckAt,
  createFlightProvider,
  createManualAdapter,
  etaMovedEnough,
  normalizeFlightNumber,
  parseAerodatabox,
  parseFlightaware,
  parseManual,
  pickupBufferMin,
  planFlightChecks,
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
    assert.equal(r.schedDep, '2026-11-08T15:20:00.000Z');
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

describe('event flight check schedule', () => {
  const bookedAt = '2026-11-01T10:00:00Z';
  // Arr 18:00, dep 12:00 → dep+30m is far from arr−6h (12:00), so check 3 is kept.
  // For the on-time 4-call case, put dep close to arr−6h so check 3 is skipped.
  const schedArr = '2026-11-08T18:00:00Z';
  const schedDepNear = '2026-11-08T11:45:00Z'; // +30m = 12:15; arr−6h = 12:00 → within 1h → skip
  const schedDepFar = '2026-11-08T10:00:00Z'; // +30m = 10:30; far from 12:00

  it('on-time flight makes 4 provider calls (dep+30 skipped when near arr−6h)', () => {
    const base = {
      bookedAt,
      schedArr,
      schedDep: schedDepNear,
      eta: schedArr,
      status: 'scheduled',
    };
    const kinds = ['booking'];
    let lastChecked = new Date(bookedAt);
    let status = 'scheduled';
    for (let i = 0; i < 10; i++) {
      const next = computeNextFlightCheckAt({
        ...base,
        status,
        after: lastChecked,
        lastCheckedAt: lastChecked,
        includeBookingCheck: false,
      });
      if (!next) break;
      const plan = planFlightChecks({ ...base, status, includeBookingCheck: false });
      const hit = plan.find((p) => p.at.getTime() > lastChecked.getTime());
      assert.ok(hit, 'expected a planned check after lastChecked');
      kinds.push(hit.kind);
      lastChecked = hit.at;
      if (hit.kind === 'eta_plus_10m') status = 'landed';
    }
    assert.deepEqual(kinds, ['booking', 'arr_minus_6h', 'eta_minus_60m', 'eta_plus_10m']);
    assert.equal(kinds.length, 4);
  });

  it('90 min delay moves checks 4 and 5 with the new ETA', () => {
    const onTime = planFlightChecks({
      bookedAt,
      schedArr,
      schedDep: schedDepFar,
      eta: schedArr,
      status: 'delayed',
      includeBookingCheck: false,
    });
    const delayedEta = '2026-11-08T19:30:00Z'; // +90 min
    const delayed = planFlightChecks({
      bookedAt,
      schedArr,
      schedDep: schedDepFar,
      eta: delayedEta,
      status: 'delayed',
      includeBookingCheck: false,
    });
    const onTime4 = onTime.find((c) => c.kind === 'eta_minus_60m');
    const onTime5 = onTime.find((c) => c.kind === 'eta_plus_10m');
    const d4 = delayed.find((c) => c.kind === 'eta_minus_60m');
    const d5 = delayed.find((c) => c.kind === 'eta_plus_10m');
    assert.ok(onTime4 && onTime5 && d4 && d5);
    assert.equal(d4.at.getTime() - onTime4.at.getTime(), 90 * 60_000);
    assert.equal(d5.at.getTime() - onTime5.at.getTime(), 90 * 60_000);
  });

  it('cancelled flight stops after the check that sees it', () => {
    const next = computeNextFlightCheckAt({
      bookedAt,
      schedArr,
      schedDep: schedDepFar,
      eta: schedArr,
      status: 'cancelled',
      after: bookedAt,
      lastCheckedAt: bookedAt,
    });
    assert.equal(next, null);
    assert.equal(
      shouldPollFlight({
        flightStatus: 'cancelled',
        nextFlightCheckAt: '2026-11-08T12:00:00Z',
        now: new Date('2026-11-08T12:05:00Z'),
      }).poll,
      false,
    );
  });

  it('respects 30 min cooldown unless force (Check now)', () => {
    const now = new Date('2026-11-08T12:00:00Z');
    const due = '2026-11-08T12:00:00Z';
    const recent = '2026-11-08T11:45:00Z';
    assert.equal(
      shouldPollFlight({
        flightStatus: 'scheduled',
        nextFlightCheckAt: due,
        lastCheckedAt: recent,
        now,
      }).poll,
      false,
    );
    assert.equal(
      shouldPollFlight({
        flightStatus: 'scheduled',
        nextFlightCheckAt: due,
        lastCheckedAt: recent,
        now,
        force: true,
      }).poll,
      true,
    );
  });

  it('cron due when next_flight_check_at <= now', () => {
    assert.equal(
      shouldPollFlight({
        flightStatus: 'scheduled',
        nextFlightCheckAt: '2026-11-08T11:50:00Z',
        lastCheckedAt: '2026-11-08T10:00:00Z',
        now: new Date('2026-11-08T12:00:00Z'),
      }).poll,
      true,
    );
    assert.equal(
      shouldPollFlight({
        flightStatus: 'landed',
        nextFlightCheckAt: '2026-11-08T11:50:00Z',
        now: new Date('2026-11-08T12:00:00Z'),
      }).poll,
      false,
    );
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
