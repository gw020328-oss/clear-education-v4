import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const head = process.argv[2];
assert.match(head ?? '', /^[a-f0-9]{40}$/);
const directory = mkdtempSync(join(tmpdir(), 'clear-snapshot-age-'));
try {
  for (const file of ['contract.mjs', 'currentness.mjs']) {
    writeFileSync(join(directory, file), execFileSync('git', ['show',
      `${head}:src/agent-preview/moodle-binding/${file}`]), { mode: 0o400 });
  }
  const { checkCurrentness, validateTimePolicy } = await import(pathToFileURL(join(directory, 'currentness.mjs')));
  const data = JSON.parse(execFileSync('docker', ['exec', 'clear-actual-reader-web',
    'cat', '/tmp/clear-http-delay.json']).toString());
  const policy = validateTimePolicy({ policyRef: 'synthetic-snapshot-age-2', attemptSeconds: 120,
    bindingSeconds: 120, roundTripMs: 5000, finalFenceMs: 1000, maxObservationAgeSeconds: 2, maxClockSkewSeconds: 0 });
  const input = { ...data, requestRef: data.response.requestRef, final: data.received, policy };
  assert.ok(data.received.mono - data.started.mono >= 3100);
  assert.ok(data.received.mono - data.started.mono < 5000);
  assert.ok(data.response.checkedAt - data.response.observedAt >= 3);
  assert.throws(() => checkCurrentness(input), /OBSERVATION_OLD/);
  console.log('PASS actual PostgreSQL return delay: age 2s rejects within RTT 5s');
  // Counterfactual demonstrates that the old assignment would mask exactly this stale snapshot.
  checkCurrentness({ ...input, response: { ...data.response, observedAt: data.response.checkedAt } });
  console.log('PASS old post-query timestamp counterexample would accept');
  console.log(`PASS pinned B currentness ${head}`);
} finally { rmSync(directory, { recursive: true, force: true }); }
