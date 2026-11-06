// Native owner Docker probe: fixed-code classification and bounded read-only retry.
// Synthetic docker errors only. Set CLEAR_DOCKER_SMOKE=1 to also run one read-only
// `docker container ls` against a label that cannot exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnerDocker, dockerFailureCode} from '../../tools/bootcamp/native-owner-docker.mjs';
import {createNormalMoodleReaderDiagnostics} from '../../tools/bootcamp/normal-moodle-reader-diagnostics.mjs';
import {normalMoodleReadClient} from '../../tools/bootcamp/normal-moodle-read-policy.mjs';

const ID = 'a'.repeat(64), NAME = 'clear-a-moodle-owner-test';
const LIST = ['container', 'ls', '--all', '--no-trunc', '--filter', 'label=clear.native.owner=run-test', '--format', '{{.ID}} {{.Names}}'];
// Shapes Node's execFileSync produces. stderr text is private and must not leak.
const daemonDown = () => Object.assign(Error('Command failed: docker container ls --filter label=clear.native.owner=run-test'),
  {status: 1, signal: null, stderr: 'Cannot connect to the Docker daemon at unix:///Users/private/.docker/run/docker.sock. Is the docker daemon running?\n'});
const daemonError = () => Object.assign(Error('Command failed: docker container ls'), {status: 1, signal: null, stderr: 'Error response from daemon: private detail\n'});
const timeout = () => Object.assign(Error('spawnSync docker ETIMEDOUT'), {code: 'ETIMEDOUT', signal: 'SIGTERM', status: null});
const spawn = code => Object.assign(Error(`spawnSync docker ${code}`), {code});

function scripted(steps) {
  const calls = [];
  const exec = (file, args) => {
    calls.push([file, ...args]);
    const step = steps.shift();
    if (step instanceof Error) throw step;
    return step ?? '';
  };
  return {calls, docker: createOwnerDocker({exec})};
}

test('docker CLI failures reduce to one fixed code', () => {
  assert.equal(dockerFailureCode(daemonDown()), 'DOCKER_DAEMON_UNREACHABLE');
  assert.equal(dockerFailureCode(Object.assign(daemonDown(), {stderr: Buffer.from(daemonDown().stderr)})), 'DOCKER_DAEMON_UNREACHABLE');
  assert.equal(dockerFailureCode(Object.assign(daemonDown(), {stderr: 'failed to connect to the docker API at unix:///private.sock; check if the path is correct and if the daemon is running: dial unix /private.sock: connect: no such file or directory\n'})), 'DOCKER_DAEMON_UNREACHABLE');
  assert.equal(dockerFailureCode(daemonError()), 'DOCKER_EXIT_NONZERO');
  assert.equal(dockerFailureCode(Object.assign(Error('x'), {status: 125})), 'DOCKER_EXIT_NONZERO');
  assert.equal(dockerFailureCode(timeout()), 'DOCKER_CLI_TIMEOUT');
  for (const code of ['EAGAIN', 'ENOBUFS', 'ENOENT', 'EMFILE']) assert.equal(dockerFailureCode(spawn(code)), code);
  assert.equal(dockerFailureCode(Object.assign(Error('x'), {signal: 'SIGKILL'})), 'DOCKER_CLI_SIGNAL');
  assert.equal(dockerFailureCode(new Proxy({}, {getOwnPropertyDescriptor() { throw Error('private'); }})), 'DOCKER_EXIT_NONZERO');
  assert.equal(dockerFailureCode(undefined), 'DOCKER_EXIT_NONZERO');
});

test('read-only listing survives a transient daemon-socket failure and still returns the real listing', () => {
  const {calls, docker} = scripted([daemonDown(), daemonDown(), `${ID} ${NAME}\n`]);
  assert.equal(docker.list(LIST), `${ID} ${NAME}\n`);
  assert.equal(calls.length, 3);
  assert(calls.every(call => call[0] === 'docker' && call[1] === 'container' && call[2] === 'ls'));
});

test('listing gives up after three calls with a classified, phase-tagged failure and no private text', () => {
  const {calls, docker} = scripted([daemonDown(), daemonDown(), daemonDown(), `${ID} ${NAME}\n`]);
  let thrown;
  try { docker.list(LIST); } catch (error) { thrown = error; }
  assert.equal(calls.length, 3);
  assert.equal(thrown.message, 'NATIVE_OWNER_DOCKER_UNAVAILABLE');
  assert.equal(thrown.failurePhase, 'NATIVE_OWNER_CONTAINER_PROBE');
  assert.equal(thrown.cause.code, 'DOCKER_DAEMON_UNREACHABLE');
  assert.equal(thrown.cause.cause, undefined, 'original exec error must not be retained');
  assert(!JSON.stringify({m: thrown.message, c: thrown.cause.message}).match(/private|docker\.sock|label=/));
});

test('other listing failures and every non-listing command are not retried', () => {
  for (const error of [daemonError(), timeout(), spawn('EAGAIN')]) {
    const {calls, docker} = scripted([error, `${ID} ${NAME}\n`]);
    assert.throws(() => docker.list(LIST), e => e.message === 'NATIVE_OWNER_DOCKER_UNAVAILABLE' && e.cause.code === dockerFailureCode(error));
    assert.equal(calls.length, 1);
  }
  const {calls, docker} = scripted([daemonDown(), 'ok']);
  assert.throws(() => docker.run(['exec', '-i', ID, 'php', '/native-scope.php', 'cleanup'], '{}'),
    e => e.message === 'NATIVE_OWNER_DOCKER_UNAVAILABLE' && e.cause.code === 'DOCKER_DAEMON_UNREACHABLE' && e.failurePhase === undefined);
  assert.equal(calls.length, 1, 'a write must never be retried');
  // A listing helper cannot be used to smuggle a write.
  const guard = scripted([]);
  for (const args of [['container', 'rm', '-f', ID], ['volume', 'rm', 'x'], 'container ls', []]) {
    assert.throws(() => guard.docker.list(args), /NATIVE_OWNER_DOCKER_LISTING/);
  }
  assert.equal(guard.calls.length, 0);
  assert.throws(() => createOwnerDocker({listAttempts: 4}), /NATIVE_OWNER_DOCKER_CONFIG/);
});

test('reader currentness: a transient blip no longer fails the read; a persistent one is diagnosed exactly', async () => {
  // Same shape as the owner runtime: assertCurrent re-lists the owned container before and after each read.
  const reader = (steps) => {
    const {calls, docker} = scripted(steps);
    const ownedContainer = () => {
      const rows = docker.list(LIST).trim().split('\n').map(row => row.trim().split(/\s+/)).filter(([, name]) => name === NAME);
      if (!(rows.length <= 1 && rows.every(([id]) => /^[a-f0-9]{64}$/.test(id)))) throw Error('NATIVE_OWNER_UNAVAILABLE');
      return rows[0]?.[0];
    };
    const assertCurrent = () => { if (ownedContainer() !== ID) throw Error('ACTIVITY_READER_INACTIVE'); };
    const diagnostics = createNormalMoodleReaderDiagnostics();
    const client = diagnostics.wrap(normalMoodleReadClient({async call() { return {sitename: 'synthetic'}; }}, assertCurrent));
    return {calls, client, diagnostics};
  };
  const row = `${ID} ${NAME}\n`;
  const ok = reader([daemonDown(), row, row]);
  assert.deepEqual(await ok.client.call('core_webservice_get_site_info'), {sitename: 'synthetic'});
  assert.equal(ok.calls.length, 3);
  assert.deepEqual(ok.diagnostics.snapshot(), []);

  const down = reader([daemonDown(), daemonDown(), daemonDown()]);
  await assert.rejects(down.client.call('core_webservice_get_site_info'), /NATIVE_OWNER_DOCKER_UNAVAILABLE/);
  const [event] = down.diagnostics.snapshot();
  assert.equal(event.method, 'core_webservice_get_site_info');
  assert.equal(event.code, 'NATIVE_OWNER_DOCKER_UNAVAILABLE');
  assert.equal(event.failurePhase, 'NATIVE_OWNER_CONTAINER_PROBE');
  assert.deepEqual(event.causes, [{errorKind: 'ERROR', code: 'DOCKER_DAEMON_UNREACHABLE', codeBasis: 'OWN_CODE'}]);
  assert(!JSON.stringify(event).match(/private|docker\.sock|label=|aaaa/));
});

test('optional read-only docker smoke', {skip: process.env.CLEAR_DOCKER_SMOKE !== '1'}, () => {
  const docker = createOwnerDocker();
  assert.equal(docker.list(['container', 'ls', '--all', '--no-trunc', '--filter',
    'label=clear.native.owner=run-00000000-0000-4000-8000-000000000000', '--format', '{{.ID}} {{.Names}}']).trim(), '');
});
