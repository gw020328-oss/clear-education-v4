import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCurrentness } from '../../src/agent-preview/moodle-binding/currentness.mjs';
import { timePolicy } from './fixtures/binding-module-fixture.mjs';

const valid = () => ({ requestRef: 'new-request', started: { wall: 100, mono: 0 }, received: { wall: 101, mono: 1000 }, final: { wall: 101, mono: 1001 },
  policy: timePolicy, response: { requestRef: 'new-request', observedAt: 100, checkedAt: 101, expiresAtExclusive: 120 } });
test('fresh snapshot from this request is accepted; exact time limits are exclusive', () => assert.doesNotThrow(() => checkCurrentness(valid())));
for (const [label, mutate, reason] of [
  ['old observedAt with new checkedAt', s => { s.response.observedAt = 10; }, 'SNAPSHOT_OUTSIDE_REQUEST'],
  ['request duration boundary', s => { s.received.mono = 5000; s.final.mono = 5000; }, 'RESPONSE_TIMEOUT'],
  ['final monotonic fence boundary', s => { s.final.mono = 2000; }, 'RESPONSE_TIMEOUT'],
  ['expiry boundary', s => { s.response.expiresAtExclusive = 101; }, 'SOURCE_EXPIRED'],
  ['monotonic reversal', s => { s.final.mono = 999; }, 'CLOCK_REVERSED'],
  ['wall reversal', s => { s.received.wall = 99; }, 'CLOCK_REVERSED'],
  ['wall jump without elapsed time', s => { s.received.wall = 110; s.final.wall = 110; }, 'CLOCK_JUMP'],
  ['maximum observation age', s => { s.policy = { ...timePolicy, maxObservationAgeSeconds: 1 }; }, 'OBSERVATION_OLD'],
  ['conservative skew expiry', s => { s.policy = { ...timePolicy, maxClockSkewSeconds: 2 }; s.response.expiresAtExclusive = 103; }, 'SOURCE_EXPIRED'],
]) test(label, () => { const s = valid(); mutate(s); assert.throws(() => checkCurrentness(s), new RegExp(reason)); });
