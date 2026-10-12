import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { client, freePort } from './helpers.mjs';

const root = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
test('CLI init/start/SIGTERM/restart/SIGKILL/unlock preserve committed synthetic state', async t => {
  const name = 'test-' + randomBytes(8).toString('hex'), directory = join(root, 'var', 'dev', name);
  const run = (command, extra = []) => execFileSync(process.execPath, ['tools/dev.mjs', command, '--name', name, ...extra],
    { cwd: root, stdio: 'pipe', timeout: 30000, encoding: 'utf8' });
  let child;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const done = once(child, 'close'); child.kill('SIGKILL'); await done;
    }
    rmSync(directory, { recursive: true, force: true });
  });
  const config = JSON.parse(run('init', ['--port', String(await freePort())]).split('\nInitialized.')[0]);
  const f = client(directory, config), original = readFileSync(join(directory, 'environment.json'));
  async function start() {
    child = spawn(process.execPath, ['tools/dev.mjs', 'start', '--name', name], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('CLI_READY_TIMEOUT')); }, 15000);
      child.stderr.resume();
      child.once('exit', () => { clearTimeout(timeout); reject(new Error('CLI_EARLY_EXIT')); });
      child.stdout.on('data', data => { if (data.toString().includes('CLEAR SYNTHETIC ready:')) { clearTimeout(timeout); resolve(); } });
    });
  }
  async function stop(signal) {
    const done = once(child, 'close'); child.kill(signal); await done;
  }
  await t.test('init/status contain only public configuration; repeated init refuses overwrite', () => {
    assert.deepEqual(JSON.parse(run('status')), config);
    assert.throws(() => run('init')); assert.deepEqual(readFileSync(join(directory, 'environment.json')), original);
    assert.equal(config.paymentAllowed, false); assert.equal(config.usableForClaim, false);
    assert.equal(JSON.stringify(config).includes(f.wallets.operator.privateKey), false);
  });
  await start(); const learner = await f.login(f.wallets.learner);
  const created = await f.request('/applications', { method: 'POST', body: { policyHash: config.policyHash },
    headers: { ...learner.headers, 'idempotency-key': 'cli-create' } });
  assert.equal(created.status, 200);
  await t.test('SIGTERM releases the listener and lock; session and application survive restart', async () => {
    await stop('SIGTERM'); assert.equal(child.exitCode, 0); assert.equal(existsSync(join(directory, 'run.lock')), false);
    await start();
    assert.deepEqual((await f.request(`/applications/${created.body.applicationId}`, { headers: learner.headers })).body, created.body);
  });
  await t.test('SIGKILL needs explicit dead-PID unlock and never resets persistent state', async () => {
    const block = await f.rpc('eth_getBlockByNumber', ['latest', false]);
    await stop('SIGKILL'); assert.equal(existsSync(join(directory, 'run.lock')), true);
    assert.throws(() => run('start'), error => error.stderr.includes('DEV_LOCKED'));
    run('unlock'); assert.equal(existsSync(join(directory, 'run.lock')), false);
    await start();
    assert.equal((await f.rpc('eth_getBlockByNumber', ['latest', false])).hash, block.hash);
    assert.deepEqual((await f.request(`/applications/${created.body.applicationId}`, { headers: learner.headers })).body, created.body);
    assert.deepEqual(readFileSync(join(directory, 'environment.json')), original);
    await stop('SIGTERM');
  });
});
