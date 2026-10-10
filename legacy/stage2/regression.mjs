import { mkdtempSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const preserved = JSON.parse(readFileSync(new URL('./stage1-preservation.json', import.meta.url)));
function checkPreserved() {
  for (const [path, expected] of Object.entries(preserved)) assert.equal(createHash('sha256').update(readFileSync(join(root, path))).digest('hex'), expected, path);
  const m = JSON.parse(readFileSync(join(root, 'baseline/manifest.json')));
  for (const [name, expected] of Object.entries(m.files)) assert.equal(createHash('sha256').update(readFileSync(join(m.originalDirectory, name))).digest('hex'), expected, name);
}
checkPreserved();
const work = mkdtempSync(join(tmpdir(), 'refund-stage1-regression-'));
for (const name of ['PROTOCOL.md', 'RefundVault.sol']) copyFileSync(join(root, 'baseline', name), join(work, name));
const runner = readFileSync(join(root, 'baseline/run.mjs'), 'utf8').replace("new URL('../codeproof-evidence-2026-09-13/escrow/package.json', import.meta.url)", JSON.stringify(join(root, 'package.json')));
writeFileSync(join(work, 'run.mjs'), runner);
const run = spawnSync(process.execPath, [join(work, 'run.mjs')], { encoding: 'utf8' });
writeFileSync(new URL('./artifacts/regression.log', import.meta.url), run.stdout + run.stderr);
assert.equal(run.status, 0, 'unmodified stage1 expectations');
const actual = JSON.parse(readFileSync(join(work, 'results.json')));
const expected = JSON.parse(readFileSync(join(root, 'baseline/results.json')));
const outcomes = r => r.scenarios.map(s => [s.scenario, s.central.accepted, s.onchain.accepted]);
assert.deepEqual(outcomes(actual), outcomes(expected));
assert.deepEqual(actual.auxiliary, expected.auxiliary);
checkPreserved();
writeFileSync(new URL('./artifacts/regression-results.json', import.meta.url), JSON.stringify(actual, null, 2) + '\n');
console.log(JSON.stringify({ originalExpectationsMatched: 14, originalAuxiliaryPassed: 5, stage1FilesUnchanged: Object.keys(preserved).length, originalFilesUnchanged: 5 }));
