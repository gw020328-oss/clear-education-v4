import { mkdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { check, privateDirectory, unlock } from '../src/dev/files.mjs';
import { initializeEnvironment, publicConfig, readEnvironment } from '../src/dev/environment.mjs';
import { startEnvironment } from '../src/dev/server.mjs';

process.umask(0o077);
const root = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
let running, stopping = false;
const stop = async () => {
  stopping = true;
  if (running) { await running.close(); console.log('CLEAR synthetic environment stopped; data preserved.'); }
};
process.once('SIGINT', () => { stop().catch(() => { process.exitCode = 1; }); });
process.once('SIGTERM', () => { stop().catch(() => { process.exitCode = 1; }); });
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { name: { type: 'string' }, port: { type: 'string' } } });
  const [command] = positionals;
  check(positionals.length === 1 && ['init', 'start', 'status', 'unlock'].includes(command), 'DEV_COMMAND');
  check(typeof values.name === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(values.name), 'DEV_NAME');
  check(command === 'init' || values.port === undefined, 'DEV_PORT_INIT_ONLY');
  if (command === 'init') {
    for (const part of ['var', 'var/dev']) {
      mkdirSync(join(root, part), { recursive: true, mode: 0o700 }); privateDirectory(join(root, part));
    }
  }
  const directory = join(root, 'var', 'dev', values.name);
  if (command === 'init') {
    const config = await initializeEnvironment({ directory, port: values.port === undefined ? 8443 : Number(values.port) });
    console.log(JSON.stringify(config, null, 2));
    console.log('Initialized. Trust only this environment ca.pem manually; see docs/current/LOCAL_SYNTHETIC.ko.md.');
  } else if (command === 'status') console.log(JSON.stringify(publicConfig(readEnvironment(directory)), null, 2));
  else if (command === 'unlock') { unlock(directory); console.log('Stale lock removed; persistent data preserved.'); }
  else {
    running = await startEnvironment({ directory, webRoot: join(root, 'web', 'dist') });
    if (stopping) await running.close();
    else console.log(`CLEAR SYNTHETIC ready: ${running.config.origin} (TEST only; Ctrl-C to stop)`);
  }
} catch (error) {
  // No underlying RPC/certificate/key/provider details in terminal output.
  const allowed = /^(DEV_[A-Z_]+|EEXIST|ENOENT|EADDRINUSE|DB_ENVIRONMENT_MISMATCH|VAULT_[A-Z_]+|TOKEN_[A-Z_]+|RUNTIME_[A-Z_]+|CHAIN_[A-Z_]+)$/;
  console.error(`CLEAR dev failed: ${allowed.test(error.message) ? error.message : allowed.test(error.code ?? '') ? error.code : 'DEV_START_FAILED'}`);
  console.error('See docs/current/LOCAL_SYNTHETIC.ko.md. Existing environments are never reset automatically.');
  process.exitCode = 1;
}
