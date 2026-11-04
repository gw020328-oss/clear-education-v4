import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const head = process.argv[2];
assert.match(head ?? '', /^[a-f0-9]{40}$/);
const canonical = value => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
const fixtures = JSON.parse(readFileSync(new URL('./registry-vectors.json', import.meta.url)));
assert.equal(fixtures.mode, 'PUBLIC_SYNTHETIC_EXPIRED_VECTORS');
for (const vector of fixtures.vectors) {
  const envelope = JSON.parse(vector.wire);
  assert.equal(vector.wire, canonical(envelope));
  assert.equal(envelope.payload, canonical(JSON.parse(envelope.payload)));
  const keyRef = Buffer.from(envelope.keyRef, 'ascii');
  const length = Buffer.alloc(4); length.writeUInt32BE(keyRef.length);
  const bytes = Buffer.concat([Buffer.from('CLEAR\0REGISTRY\0ED25519\0V1\0'), length, keyRef, Buffer.from(envelope.payload)]);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), vector.signedBytesSha256);
  const publicKey = createPublicKey({ key: Buffer.from('302a300506032b6570032100' + vector.publicKey, 'hex'), format: 'der', type: 'spki' });
  const signature = Buffer.from(envelope.signature, 'hex');
  assert.equal(verify(null, bytes, publicKey, signature), true);
  const changed = Buffer.from(bytes); changed[0] ^= 1;
  assert.equal(verify(null, changed, publicKey, signature), false);
  signature[0] ^= 1;
  assert.equal(verify(null, bytes, publicKey, signature), false);
  console.log(`PASS PHP-to-Node Ed25519 ${vector.kind}: exact bytes, valid signature, domain/signature tamper rejection`);
}
const directory = mkdtempSync(join(tmpdir(), 'clear-registry-contract-'));
try {
  writeFileSync(join(directory, 'contract.mjs'), execFileSync('git', ['show', `${head}:src/agent-preview/moodle-binding/contract.mjs`]), { mode: 0o400 });
  const { validateDto } = await import(pathToFileURL(join(directory, 'contract.mjs')));
  const dto = JSON.parse(execFileSync('docker', ['exec', 'clear-actual-reader-web', 'cat', '/tmp/clear-registry-dto.json']));
  validateDto('confirmation', dto);
  assert.equal(dto.issuerEpoch, 'issuer-registry-v1');
  assert.equal(dto.trustEpoch, 1); assert.equal(dto.rosterRevision, 1);
  console.log(`PASS signed-registry native Moodle response satisfies unchanged B .3 DTO at ${head}`);
} finally { rmSync(directory, { recursive: true, force: true }); }
