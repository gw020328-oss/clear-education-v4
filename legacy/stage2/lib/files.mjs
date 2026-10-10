import { open, writeFile } from 'node:fs/promises';
import { EvidenceError, need, validateEvidence, validateTrust } from './evidence.mjs';

// Read at most LIMIT + 1 bytes even if an untrusted file is unexpectedly large.
const LIMIT = 64 * 1024;
export async function readJson(path) {
  const handle = await open(path, 'r');
  try {
    need((await handle.stat()).isFile(), 'FILE_TYPE');
    const buffer = Buffer.alloc(LIMIT + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    need(length <= LIMIT, 'FILE_TOO_LARGE');
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length))); }
    catch { throw new EvidenceError('INVALID_JSON'); }
  } finally { await handle.close(); }
}
export async function readTrust(path) { return validateTrust(await readJson(path)); }
export async function importEvidence(path, trusted, recipient, time) {
  const packet = await readJson(path);
  validateEvidence(packet, trusted, recipient, time);
  return packet;
}
export async function exportEvidence(path, packet, trusted, recipient, time) {
  validateEvidence(packet, trusted, recipient, time);
  // Exclusive creation prevents accidental replacement of a user's evidence.
  await writeFile(path, JSON.stringify(packet, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
export async function writePublicJson(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
