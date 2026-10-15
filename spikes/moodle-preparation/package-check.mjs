import { lstat, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import { constants } from 'node:fs';

// Offline preparation only. The caller supplies trusted pins, never a manifest
// copied from the package being checked. No network, Docker, secrets or writes.
export async function checkPinnedPackage(root, pins) {
  if (typeof root !== 'string' || !isAbsolute(root) || !pins || Array.isArray(pins)
    || typeof pins !== 'object' || Object.keys(pins).length < 1 || Object.keys(pins).length > 100) {
    throw new Error('PACKAGE_CHECK_INPUT');
  }
  const entries = Object.entries(pins);
  for (const [path, digest] of entries) {
    if (!/^[\p{L}\p{N}_./-]+$/u.test(path) || path.startsWith('/')
      || path.split('/').some(p => !p || p === '.' || p === '..')
      || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('PACKAGE_CHECK_INPUT');
  }
  const failures = [];
  for (const [path, digest] of entries) {
    try {
      // Reject symlinks, including a symlink package root or parent directory.
      const parts = [...root.split('/').filter(Boolean), ...path.split('/')];
      let current = '/';
      for (const [index, part] of parts.entries()) {
        current = join(current, part);
        const stat = await lstat(current);
        if (stat.isSymbolicLink() || (index < parts.length - 1 && !stat.isDirectory())) {
          throw new Error('UNSAFE_PACKAGE_PATH');
        }
      }
      const file = await open(join(root, path), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('PACKAGE_FILE_LIMIT');
        const bytes = Buffer.alloc(stat.size + 1);
        let offset = 0;
        while (offset < bytes.length) {
          const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, null);
          if (!bytesRead) break;
          offset += bytesRead;
        }
        if (offset !== stat.size) throw new Error('PACKAGE_FILE_CHANGED');
        const actual = createHash('sha256').update(bytes.subarray(0, offset)).digest('hex');
        if (actual !== digest) throw new Error('PACKAGE_HASH_MISMATCH');
      } finally { await file.close(); }
    } catch (error) {
      const allowed = new Set(['UNSAFE_PACKAGE_PATH', 'PACKAGE_FILE_LIMIT', 'PACKAGE_FILE_CHANGED', 'PACKAGE_HASH_MISMATCH']);
      failures.push({ path, code: error.code === 'ENOENT' ? 'PACKAGE_FILE_MISSING'
        : allowed.has(error.message) ? error.message : 'PACKAGE_FILE_UNAVAILABLE' });
    }
  }
  return {
    status: failures.length ? 'PACKAGE_NOT_MATCHED' : 'PINNED_BYTES_MATCH',
    expectedFiles: entries.length, matchedFiles: entries.length - failures.length, failures,
    assurance: 'OFFLINE_BYTE_COMPARISON_ONLY',
    sourceAuthenticityVerified: false, collectionEnabled: false,
    humanAttentionProven: false, paymentAuthorized: false,
  };
}
