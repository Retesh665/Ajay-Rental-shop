import test from 'node:test';
import assert from 'node:assert/strict';
import { isoDateIST, istDateTimeToUTC } from '../src/lib/dates.js';

test('IST calendar date near evening remains same day (no double conversion)', () => {
  const instant = new Date('2026-10-22T13:45:00.000Z'); // 19:15 IST
  const today = isoDateIST(instant);
  assert.equal(today, '2026-10-22');
  assert.equal(istDateTimeToUTC(today, '00:00').toISOString(), '2026-10-21T18:30:00.000Z');
});

test('IST date rolls over at 00:00 IST', () => {
  assert.equal(isoDateIST(new Date('2026-10-22T18:29:59.000Z')), '2026-10-22');
  assert.equal(isoDateIST(new Date('2026-10-22T18:30:00.000Z')), '2026-10-23');
});
