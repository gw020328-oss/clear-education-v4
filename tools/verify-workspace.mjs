import assert from 'node:assert/strict';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const safePath = (path) => {
  assert.equal(typeof path, 'string');
  const resolved = resolve(root, path);
  assert.ok(relative(root, resolved) && !relative(root, resolved).startsWith(`..${sep}`));
  assert.ok(!path.startsWith('/') && !path.split('/').includes('..'));
  return resolved;
};

const toolchain = await readJson('config/toolchain.json');
assert.equal(process.versions.node, toolchain.node);
const packageJson = await readJson('package.json');
const lock = await readJson('package-lock.json');
const oldLock = await readJson('legacy/package-lock.json');
assert.deepEqual(packageJson.dependencies, toolchain.dependencies);
assert.deepEqual(lock.packages[''].dependencies, packageJson.dependencies);
const transitive = ({ packages }) => Object.fromEntries(Object.entries(packages).filter(([key]) => key));
assert.deepEqual(transitive(lock), transitive(oldLock), 'Original locked dependency graph must be retained');

const copy = await readJson('docs/w01/source-copy.json');
const copiedPaths = new Set();
for (const file of copy.sourceFiles) {
  const path = safePath(`legacy/${file.path}`);
  const info = await lstat(path);
  assert.ok(info.isFile() && !info.isSymbolicLink());
  assert.equal(info.mode & 0o222, 0, 'Legacy reference files must be read-only');
  assert.equal(info.size, file.bytes);
  assert.equal(sha256(await readFile(path)), file.sha256, `Legacy changed: ${file.path}`);
  copiedPaths.add(`legacy/${file.path}`);
}
async function walk(path) {
  const found = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'No symlinks in source reference');
    if (entry.isDirectory()) found.push(...await walk(child));
    else found.push(relative(root, child));
  }
  return found;
}
assert.deepEqual(new Set(await walk(resolve(root, 'legacy'))), copiedPaths);
for (const file of await readJson('docs/w01/reference-inputs.json')) {
  assert.equal(sha256(await readFile(resolve(root, 'docs/reference', file.file))), file.sha256);
}

const expected = new Map([
  ['local-synthetic', ['SYNTHETIC', 431701]],
  ['local-real-ybm', ['REAL_YBM', 431702]],
  ['remote-synthetic', ['SYNTHETIC', 431703]],
]);
const unique = { instanceId: new Set(), chainId: new Set(), databaseName: new Set(), paths: new Set() };
const files = (await readdir(resolve(root, 'config/environments'))).filter((name) => name.endsWith('.json'));
assert.equal(files.length, expected.size);
for (const file of files) {
  const config = await readJson(`config/environments/${file}`);
  const [mode, chainId] = expected.get(config.environmentId) ?? [];
  assert.equal(config.schemaVersion, 4);
  assert.equal(config.status, 'PREPARED_NOT_STARTED');
  assert.equal(config.networkType, 'DEDICATED_TEST_CHAIN');
  assert.equal(config.dataMode, mode);
  assert.equal(config.chainId, chainId);
  assert.match(config.instanceId, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
  for (const key of ['instanceId', 'chainId', 'databaseName']) {
    assert.ok(!unique[key].has(config[key]), `Shared environment ${key}`);
    unique[key].add(config[key]);
  }
  assert.deepEqual(Object.keys(config.paths).sort(), ['chainState', 'postgresData', 'serviceArtifacts', 'retainedServiceData', 'privateConfig', 'rawProofMount'].sort());
  for (const [kind, path] of Object.entries(config.paths)) {
    const absolute = safePath(path);
    const prefix = kind === 'privateConfig' ? 'private' : kind === 'rawProofMount' ? 'var' : 'data';
    assert.ok(path.startsWith(`${prefix}/${config.environmentId}/`) || path === `${prefix}/${config.environmentId}`);
    assert.ok(!unique.paths.has(absolute));
    unique.paths.add(absolute);
    assert.ok((await lstat(absolute)).isDirectory());
    assert.equal(execFileSync('git', ['check-ignore', path], { cwd: root, encoding: 'utf8' }).trim(), path);
  }
  assert.equal(config.mayStartProductServices, false);
  assert.equal(config.credentials.provisioned, false);
  assert.equal(config.datePolicyStatus, 'UNCONFIRMED');
  assert.equal(config.rawProofStorage.requiredFilesystem, 'tmpfs');
  assert.equal(config.rawProofStorage.allowDiskFallback, false);
  assert.equal(config.rawProofStorage.ready, false);
  assert.equal(config.rawProofStorage.maxRetentionSeconds, 86400);
  assert.equal(config.rawProofStorage.deleteOnClaimPacketIssuance, true);
  assert.equal(config.residualRetention.maxDaysAfterFinalClaimDeadline, 30);
  const manifest = await readJson(config.deploymentManifest);
  for (const key of ['schemaVersion', 'instanceId', 'chainId', 'dataMode', 'environmentId']) assert.equal(manifest[key], config[key]);
  assert.equal(manifest.manifestStatus, 'PENDING_DEPLOYMENT');
  assert.equal(manifest.usableForClaim, false);
  for (const key of ['genesisHash', 'deploymentBlock', 'deploymentBlockHash', 'vaultAddress', 'tokenAddress', 'vaultRuntimeBytecodeHash', 'tokenRuntimeBytecodeHash', 'policyHash', 'runtimeConfigHash', 'abiHash', 'buildHash', 'releaseSignature']) assert.equal(manifest[key], null);
  assert.deepEqual(manifest.rpcUrls, []);
  assert.deepEqual(manifest.recoveryUrls, []);
}
assert.equal(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim(), root.replace(/\/$/, ''));
assert.equal(execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(), 'codex/clear-education-v4');
for (const path of ['.env', '.env.local', 'issuer.key', '.toolchain/cache', 'node_modules/package', 'private/secret', 'data/proof', 'var/raw-proof', 'artifacts/proof']) {
  assert.equal(execFileSync('git', ['check-ignore', path], { cwd: root, encoding: 'utf8' }).trim(), path);
}
for (const path of execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean)) {
  assert.ok(!/^(?:private|data|var|node_modules|\.toolchain|artifacts|tmp|\.runtime)\//.test(path), `Private/runtime file tracked: ${path}`);
  assert.ok(!/(?:^|\/)\.env(?:\.|$)|\.(?:key|pem|p12)$/.test(path), `Secret file tracked: ${path}`);
}
console.log(JSON.stringify({ result: 'PASS', schemaVersion: 4, sourceReferenceFiles: copy.sourceFiles.length, profiles: expected.size, runtime: process.versions.node, dependencyGraphPreserved: true, pendingManifestsNotClaimable: true }));
