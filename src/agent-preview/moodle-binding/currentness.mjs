import { exact, integer, requireRule } from './contract.mjs';

// No operational defaults: callers must inject an explicitly approved policy.
export function validateTimePolicy(p) {
  exact(p, ['policyRef', 'attemptSeconds', 'bindingSeconds', 'roundTripMs', 'finalFenceMs', 'maxObservationAgeSeconds', 'maxClockSkewSeconds']);
  requireRule(typeof p.policyRef === 'string' && p.policyRef.length > 0, 'TIME_POLICY');
  for (const key of Object.keys(p).filter(k => k !== 'policyRef')) requireRule(integer(p[key]), 'TIME_POLICY');
  requireRule(p.attemptSeconds > 0 && p.attemptSeconds <= 120 && p.bindingSeconds > 0 && p.bindingSeconds <= 300
    && p.roundTripMs > 0 && p.roundTripMs <= 5000 && p.finalFenceMs > 0 && p.finalFenceMs <= 1000
    && p.maxObservationAgeSeconds > 0 && p.maxObservationAgeSeconds <= 10 && p.maxClockSkewSeconds <= 2, 'TIME_POLICY');
  return Object.freeze({ ...p });
}
export function sample(clock) {
  const value = { wall: clock.wall(), mono: clock.monotonic() };
  requireRule(integer(value.wall) && value.wall > 0 && Number.isFinite(value.mono) && value.mono >= 0, 'CLOCK');
  return value;
}
export function checkCurrentness({ response: r, requestRef, started, received, final, policy: p }) {
  requireRule(r.requestRef === requestRef, 'REQUEST_REF');
  requireRule(received.mono >= started.mono && final.mono >= received.mono
    && received.wall >= started.wall && final.wall >= received.wall, 'CLOCK_REVERSED');
  requireRule(received.mono - started.mono < p.roundTripMs && final.mono - received.mono < p.finalFenceMs, 'RESPONSE_TIMEOUT');
  const skew = p.maxClockSkewSeconds;
  requireRule(received.wall - started.wall <= Math.ceil((received.mono - started.mono) / 1000) + skew
    && final.wall - received.wall <= Math.ceil((final.mono - received.mono) / 1000) + skew, 'CLOCK_JUMP');
  requireRule(r.observedAt <= r.checkedAt && r.observedAt >= started.wall - skew
    && r.checkedAt <= received.wall + skew && r.checkedAt >= started.wall - skew, 'SNAPSHOT_OUTSIDE_REQUEST');
  requireRule(final.wall - r.observedAt + skew < p.maxObservationAgeSeconds, 'OBSERVATION_OLD');
  requireRule(final.wall < r.expiresAtExclusive - skew && r.checkedAt < r.expiresAtExclusive, 'SOURCE_EXPIRED');
  if (r.confirmedAt !== undefined) requireRule(r.confirmedAt <= r.observedAt && r.expiresAtExclusive <= r.confirmedAt + p.bindingSeconds, 'CONFIRMATION_TIME');
}
