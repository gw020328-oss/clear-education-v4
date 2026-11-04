import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Read B's immutable Git objects; neither checkout nor modify B/common files.
const commit = '9db5ac78ecb1f174cd8bd23965fd4c8160849310';
const source = name => execFileSync('git', ['show', `${commit}:src/agent-preview/moodle-binding/${name}.mjs`], { encoding: 'utf8' });
const contractSource = source('contract');
const url = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const contractUrl = url(contractSource);
const { validateDto, confirmationDigest } = await import(contractUrl);
const { checkCurrentness } = await import(url(source('currentness').replace("'./contract.mjs'", JSON.stringify(contractUrl))));
const child = spawn('docker', ['exec', '-i', '-e', 'CLEAR_ACTUAL_MOODLE_PROBE=1',
  'clear-actual-reader-web', 'php', '/probe/moodle-integration/wire_probe.php'], { stdio: ['pipe', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.on('data', data => { stderr += data; });
const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
const next = async () => {
  let timer;
  try {
    const line = await Promise.race([lines.next(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('PHP_TIMEOUT')), 60000); })]);
    assert.equal(line.done, false, 'PHP exited before response');
    return JSON.parse(line.value);
  } finally { clearTimeout(timer); }
};
const sample = () => ({ wall: Math.floor(Date.now() / 1000), mono: performance.now() });
const policy = { roundTripMs: 5000, finalFenceMs: 1000, maxClockSkewSeconds: 0, maxObservationAgeSeconds: 10, bindingSeconds: 120 };
const evidence = { bCommit: commit, contractSha256: createHash('sha256').update(contractSource).digest('hex'), checks: [], actualPhpResponses: [] };
const pass = name => { evidence.checks.push(name); console.log(`PASS ${name}`); };
async function call(op, rest = {}) {
  child.stdin.write(JSON.stringify({ op, ...rest }) + '\n');
  return next();
}
async function query(kind, request) {
  validateDto(kind === 'confirmation' ? 'confirmationRequest' : 'observationsRequest', request);
  const started = sample();
  const result = await call(kind, { request });
  const received = sample();
  assert.equal(result.ok, true, result.code);
  const dto = validateDto(kind, result.result);
  checkCurrentness({ response: dto, requestRef: request.requestRef, started, received, final: sample(), policy });
  evidence.actualPhpResponses.push({ kind, started, received, dto });
  return dto;
}
try {
  assert.deepEqual(await next(), { ready: true });
  for (const [label, issuer, attemptRef, requestRef] of [
    ['one-character refs', 'e', 'a', 'q'],
    ['128-character refs', 'E' + 'a'.repeat(127), 'A' + 'b'.repeat(127), 'R' + 'c'.repeat(127)],
    ['ordinary opaque refs', 'issuer-probe-v1', 'attempt-wire-final', 'request_preview'],
  ]) {
    const request = { version: 'clear-moodle-confirmation.3', issuerEpoch: issuer, attemptRef, requestRef, bindingScopeHash: 'b'.repeat(64) };
    validateDto('confirmationRequest', request);
    assert.equal((await call('register', { request })).ok, true);
    assert.deepEqual(await call('confirmation', { request }), { ok: false, code: 'CONFIRMATION' });
    pass(`${label}: lookup never creates a confirmation`);
    const minted = await call('mint', { request });
    assert.equal(minted.ok, true);assert.equal(minted.result.nativeClosed, true);
    pass(`${label}: native handler persists and closes before returning`);
    const first = await query('confirmation', request);
    pass(`${label}: actual PHP confirmation passes B validateDto and currentness`);
    const second = await query('confirmation', { ...request, requestRef: 'request_complete' });
    assert.equal(first.confirmationRef, second.confirmationRef);
    assert.equal(first.confirmedAt, second.confirmedAt);
    assert.equal(first.expiresAtExclusive, second.expiresAtExclusive);
    assert.equal(confirmationDigest(first), confirmationDigest(second));
    pass(`${label}: fresh request preserves original confirmation lifetime and digest`);
    const observationsRequest = { version: 'clear-moodle-observations.3', requestRef: 'request_observe', issuerEpoch: issuer,
      bindingScopeHash: request.bindingScopeHash, confirmationRef: first.confirmationRef };
    const observed = await query('observations', observationsRequest);
    assert.equal(observed.observations[0].status, 'INCOMPLETE');
    pass(`${label}: actual PHP observations pass B validateDto and currentness`);
    const formerShape = structuredClone(observed);
    formerShape.observations[0].state = formerShape.observations[0].status;delete formerShape.observations[0].status;
    assert.throws(() => validateDto('observations', formerShape), /DTO_KEYS/);
    pass(`${label}: former state key is rejected by unchanged B validator`);
    const before = await call('count');
    assert.equal((await call('mint', { request })).ok, false);
    assert.deepEqual(await call('count'), before);
    pass(`${label}: repeated explicit mint cannot renew the same attempt`);
    for (const [name, change] of [
      ['issuer substitution', { issuerEpoch: 'different-issuer' }], ['scope substitution', { bindingScopeHash: 'f'.repeat(64) }],
      ['extra browser user', { userId: 1 }], ['129-character ref', { requestRef: 'R'.repeat(129) }],
      ['invalid ref prefix', { requestRef: '_bad' }], ['uppercase scope hash', { bindingScopeHash: 'A'.repeat(64) }],
    ]) {
      assert.equal((await call('confirmation', { request: { ...request, ...change } })).ok, false);
      assert.deepEqual(await call('count'), before);
      pass(`${label}: ${name} rejected without issuance`);
    }
    if (label === 'ordinary opaque refs') {
      assert.equal((await call('completePage')).ok, true);
      const complete = await query('observations', { ...observationsRequest, requestRef: 'request_after_completion' });
      assert.equal(complete.observations[0].status, 'COMPLETE');
      assert.equal(complete.expiresAtExclusive, first.expiresAtExclusive);
      pass('actual Page mutation is observed in a new snapshot without confirmation renewal');
      assert.equal((await call('persistRoleSwitch')).result.nativeClosed, true);
      assert.deepEqual(await call('observations', { request: observationsRequest }), { ok: false, code: 'STALE_CONFIRMATION' });
      pass('native reopen and persisted core role switch invalidate confirmation');
      assert.equal((await call('revokeAttempt', { attemptRef })).ok, true);
      assert.deepEqual(await call('confirmation', { request }), { ok: false, code: 'ATTEMPT_BINDING' });
      pass('server registry revocation blocks confirmation lookup');
    }
  }
  child.stdin.end();
  const [exitCode] = await once(child, 'exit');
  assert.equal(exitCode, 0);assert.equal(stderr, '');
  writeFileSync(new URL('./cross-language-output.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`CROSS_LANGUAGE_CHECKS=${evidence.checks.length}`);
} finally {
  child.stdin.destroy();child.kill();
}
