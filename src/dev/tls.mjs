import { execFileSync } from 'node:child_process';
import { chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { check, privateRead, writeNew } from './files.mjs';

// A private per-environment CA. Trust installation is deliberately manual.
export function createCertificates(directory) {
  const config = join(directory, 'openssl.cnf');
  writeNew(config, `[req]
distinguished_name=dn
prompt=no
[dn]
CN=CLEAR local synthetic development
[ca]
basicConstraints=critical,CA:TRUE,pathlen:0
keyUsage=critical,keyCertSign,cRLSign
[server]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost,IP:127.0.0.1
`);
  const path = name => join(directory, name);
  const openssl = args => {
    try { execFileSync('openssl', args, { stdio: 'pipe', timeout: 30000 }); }
    catch { throw new Error('DEV_OPENSSL_FAILED'); }
  };
  openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365', '-config', config,
    '-extensions', 'ca', '-keyout', path('ca.key'), '-out', path('ca.pem')]);
  openssl(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-config', config, '-subj', '/CN=localhost',
    '-keyout', path('server.key'), '-out', path('server.csr')]);
  openssl(['x509', '-req', '-in', path('server.csr'), '-CA', path('ca.pem'), '-CAkey', path('ca.key'),
    '-CAcreateserial', '-days', '90', '-extfile', config, '-extensions', 'server', '-out', path('server.pem')]);
  for (const name of ['ca.key', 'ca.pem', 'ca.srl', 'server.key', 'server.csr', 'server.pem']) chmodSync(path(name), 0o600);
  return new X509Certificate(privateRead(path('ca.pem'))).fingerprint256;
}

export function loadTls(directory, fingerprint) {
  const ca = new X509Certificate(privateRead(join(directory, 'ca.pem')));
  const cert = privateRead(join(directory, 'server.pem')), key = privateRead(join(directory, 'server.key'));
  const leaf = new X509Certificate(cert), now = Date.now();
  check(ca.fingerprint256 === fingerprint && leaf.verify(ca.publicKey) && leaf.checkIP('127.0.0.1')
    && leaf.checkPrivateKey(createPrivateKey(key)) && now >= Date.parse(leaf.validFrom)
    && now < Date.parse(leaf.validTo) && now < Date.parse(ca.validTo), 'DEV_TLS_INVALID');
  return { cert, key, minVersion: 'TLSv1.2' };
}
