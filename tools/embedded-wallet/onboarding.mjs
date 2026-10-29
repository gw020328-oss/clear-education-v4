import {mkdirSync, existsSync, writeFileSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createCertificates, loadTls} from '../../src/dev/tls.mjs';
import {createOnboardingServer} from './server.mjs';
const directory = fileURLToPath(new URL('../../var/embedded-wallet-onboarding/', import.meta.url));
const command = process.argv[2];
if (command === 'init') {
  if (existsSync(directory)) throw Error('ONBOARDING_ALREADY_INITIALIZED');
  mkdirSync(directory, {recursive: true, mode: 0o700});
  const fingerprint = createCertificates(directory);
  writeFileSync(directory + '/settings.json', JSON.stringify({origin: 'https://127.0.0.1:9457', rpcPort: 9458, appId: null, fingerprint}, null, 2) + '\n', {mode: 0o600});
  console.log('Prepared isolated TLS and public App ID settings. No trust-store change.');
  console.log('Public CA certificate: ' + directory + 'ca.pem');
} else if (command === 'start') {
  const settings = JSON.parse(readFileSync(directory + '/settings.json'));
  const host = await createOnboardingServer({...settings, tls: loadTls(directory, settings.fingerprint),
    buildDirectory: fileURLToPath(new URL('../../var/embedded-wallet-build', import.meta.url))});
  console.log(JSON.stringify({url: host.config.redirectUri, phase: host.config.phase, appConfigured: !!host.config.appId,
    chainId: host.config.chainId, rpcUrl: host.config.rpcUrl, productActivated: false}));
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await host.close(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} else throw Error('Usage: tools/node tools/embedded-wallet/onboarding.mjs init|start');
