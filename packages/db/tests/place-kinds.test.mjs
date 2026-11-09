import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './harness.mjs';

// 0038: landmark and square are public place types; address stays private.
const db = await createTestDb({ seed: true });
const q = (s, p) => db.pool.query(s, p);

test('landmarks and squares can be public and are suggested', async () => {
  await q(`insert into saved_places (label, address, place_id, lat, lng, kind, is_public, source) values
    ('Acropolis','Athens 105 58','ChIJacr',37.9715,23.7257,'landmark',true,'office'),
    ('Temple of Poseidon, Sounio','Sounio 195 00','ChIJsou',37.6502,24.0246,'landmark',true,'office'),
    ('Syntagma Square','Athens 105 63','ChIJsyn',37.9755,23.7348,'square',true,'office')`);
  const hits = (await q(`select label from search_saved_places('soun', 8)`)).rows.map((r) => r.label);
  assert.deepEqual(hits, ['Temple of Poseidon, Sounio']);
  assert.equal((await q(`select * from search_saved_places('syntagma', 8)`)).rows[0].kind, 'square');
});

test('unknown kinds are refused and an address can still never be public', async () => {
  await assert.rejects(q(`insert into saved_places (label,address,lat,lng,kind) values ('x','x',37.9,23.7,'castle')`), /saved_places_kind_check/);
  await assert.rejects(q(`insert into saved_places (label,address,lat,lng,kind,is_public) values ('Villa','x',37.9,23.7,'address',true)`), /saved_places_public_kind/);
});

test.after(() => db.drop());
