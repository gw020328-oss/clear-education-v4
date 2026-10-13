import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { initializeEnvironment, openEnvironment, readEnvironment } from '../../src/dev/environment.mjs';
import { lock, unlock } from '../../src/dev/files.mjs';
import { startEnvironment } from '../../src/dev/server.mjs';
import { client, fixture, freePort } from './helpers.mjs';

test('isolated initialization, persistent bindings and explicit stale-lock recovery', async t => {
  const f = await fixture(t), directory = f.directory, configPath = join(directory, 'environment.json');
  const original = readFileSync(configPath);
  await t.test('initialization never overwrites a directory; new identities differ', async () => {
    await assert.rejects(initializeEnvironment({ directory, port: await freePort() }), { code: 'EEXIST' });
    const other = await initializeEnvironment({ directory: join(f.root, 'other'), port: await freePort() });
    assert.notEqual(other.chainId, f.config.chainId); assert.notEqual(other.instanceId, f.config.instanceId);
    assert.notEqual(other.accounts.operator, f.config.accounts.operator); assert.notEqual(other.accounts.learner, f.config.accounts.learner);
    assert.notEqual(other.vaultAddress, f.config.vaultAddress); assert.deepEqual(readFileSync(configPath), original);
  });
  await t.test('two developers run simultaneously and cannot reuse each other’s session', async () => {
    const otherDirectory = join(f.root, 'other'), other = readEnvironment(otherDirectory);
    const first = await startEnvironment({ directory, webRoot: join(f.root, 'absent') });
    const second = await startEnvironment({ directory: otherDirectory, webRoot: join(f.root, 'absent') });
    try {
      const login = await f.login(f.wallets.learner), otherClient = client(otherDirectory, other);
      assert.equal((await f.request('/auth/session', { headers: login.headers })).status, 200);
      assert.equal((await otherClient.request('/auth/session', { headers: login.headers })).status, 401);
    } finally { await first.close(); await second.close(); }
  });
  await t.test('active environment and reused live PID cannot be unlocked', async () => {
    const env = await openEnvironment(directory);
    try {
      await assert.rejects(openEnvironment(directory), /DEV_LOCKED/);
      assert.throws(() => unlock(directory), /DEV_PROCESS_MAY_BE_RUNNING/);
    } finally { await env.close(); }
    assert.equal(existsSync(join(directory, 'run.lock')), false);
  });
  await t.test('copy and symlink of another environment fail path binding', async () => {
    const copy = join(f.root, 'copy'); cpSync(directory, copy, { recursive: true }); chmodSync(copy, 0o700);
    await assert.rejects(openEnvironment(copy), /DEV_ENVIRONMENT/);
    const link = join(f.root, 'linked'); symlinkSync(directory, link);
    await assert.rejects(openEnvironment(link), /DEV_DIRECTORY/);
  });
  for (const [label, change, error] of [
    ['profile', c => { c.profile = 'REAL_YBM'; }, /DEV_ENVIRONMENT/],
    ['origin', c => { c.origin = 'http://127.0.0.1:8443'; }, /DEV_ORIGIN/],
    ['origin DB binding', c => { c.origin = 'https://127.0.0.1:65534'; }, /DB_ENVIRONMENT_MISMATCH/],
    ['instance', c => { c.instanceId = '0x' + 'ab'.repeat(32); }, /DEV_ENVIRONMENT/],
    ['chain', c => { c.chainId++; c.pin.chainId++; }, /DB_ENVIRONMENT_MISMATCH/],
    ['genesis', c => { c.pin.genesisHash = '0x' + 'ab'.repeat(32); }, /VAULT_GENESIS/],
    ['runtime', c => { c.runtimeConfigHash = '0x' + 'ab'.repeat(32); }, /DEV_ENVIRONMENT/],
    ['CA', c => { c.caFingerprint = 'untrusted'; }, /DEV_TLS_INVALID/],
  ]) await t.test(`rejects changed ${label} without replacing the environment`, async () => {
    const config = JSON.parse(original); change(config); writeFileSync(configPath, JSON.stringify(config));
    try { await assert.rejects(openEnvironment(directory), error); }
    finally { writeFileSync(configPath, original); }
    assert.equal(existsSync(join(directory, 'run.lock')), false);
  });
  for (const path of ['chain', 'application/applications.sqlite']) await t.test(`missing ${path} fails rather than reinitializing`, async () => {
    const full = join(directory, path), saved = full + '.saved'; renameSync(full, saved);
    try { await assert.rejects(openEnvironment(directory)); assert.equal(existsSync(full), false); }
    finally { renameSync(saved, full); }
  });
  await t.test('private file permissions and wallet binding are checked', async () => {
    const file = join(directory, 'wallets.json'); chmodSync(file, 0o644);
    try { await assert.rejects(openEnvironment(directory), /DEV_FILE/); } finally { chmodSync(file, 0o600); }
    const config = JSON.parse(original); config.accounts.learner = config.accounts.operator;
    writeFileSync(configPath, JSON.stringify(config));
    try { await assert.rejects(openEnvironment(directory), /DEV_WALLETS/); } finally { writeFileSync(configPath, original); }
  });
  await t.test('occupied port releases resources and lock for retry', async () => {
    const socket = createServer();
    await new Promise(resolve => socket.listen(Number(new URL(f.config.origin).port), '127.0.0.1', resolve));
    try { await assert.rejects(startEnvironment({ directory, webRoot: join(f.root, 'absent') }), { code: 'EADDRINUSE' }); }
    finally { await new Promise(resolve => socket.close(resolve)); }
    assert.equal(existsSync(join(directory, 'run.lock')), false);
    const server = await startEnvironment({ directory, webRoot: join(f.root, 'absent') });
    try { assert.equal((await f.request('/')).status, 200); } finally { await server.close(); }
  });
  await t.test('malformed lock refuses recovery and preserves state', () => {
    const release = lock(directory); writeFileSync(join(directory, 'run.lock'), '{"pid":-1}');
    try { assert.throws(() => unlock(directory), /DEV_LOCK_INVALID/); } finally { release(); }
    assert.deepEqual(readFileSync(configPath), original); assert.equal(readEnvironment(directory).profile, 'CLEAR_LOCAL_SYNTHETIC');
  });
});
