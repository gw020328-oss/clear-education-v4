import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, symlink, rm, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPinnedPackage } from '../../spikes/moodle-preparation/package-check.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'clear-moodle-preparation-')));
  t.after(() => rm(path, { recursive: true, force: true }));
  await mkdir(join(path, 'code'));
  await writeFile(join(path, 'code', 'example.txt'), 'synthetic-public-module');
  return { path, pins: { 'code/example.txt': digest('synthetic-public-module') } };
}

test('offline check accepts only byte equality and never grants source/payment authority', async t => {
  const f = await fixture(t), before = await readdir(f.path);
  const result = await checkPinnedPackage(f.path, f.pins);
  assert.equal(result.status, 'PINNED_BYTES_MATCH'); assert.equal(result.matchedFiles, 1);
  for (const key of ['sourceAuthenticityVerified', 'collectionEnabled', 'humanAttentionProven', 'paymentAuthorized']) {
    assert.equal(result[key], false);
  }
  assert.deepEqual(await readdir(f.path), before);
});

test('changed/missing bytes are safe failures, not a refreshed trusted pin', async t => {
  const f = await fixture(t);
  await writeFile(join(f.path, 'code', 'example.txt'), 'different-SYNTHETIC_CONTENT');
  const report = await checkPinnedPackage(f.path, { ...f.pins, 'code/missing.txt': digest('absent') });
  assert.equal(report.status, 'PACKAGE_NOT_MATCHED'); assert.equal(report.matchedFiles, 0);
  assert.deepEqual(report.failures.map(f => f.code), ['PACKAGE_HASH_MISMATCH', 'PACKAGE_FILE_MISSING']);
  assert.ok(!JSON.stringify(report).includes('different-SYNTHETIC_CONTENT'));
  assert.ok(!JSON.stringify(report).includes(f.path));
});

test('the public package Korean filenames are valid pinned paths', async t => {
  const f = await fixture(t);
  await writeFile(join(f.path, '01_검증결과.txt'), 'synthetic-report');
  const report = await checkPinnedPackage(f.path, { '01_검증결과.txt': digest('synthetic-report') });
  assert.equal(report.status, 'PINNED_BYTES_MATCH');
});

test('a package cannot supply path traversal or an absolute filename', async t => {
  const f = await fixture(t);
  for (const path of ['../outside.txt', '/outside.txt', 'code//example.txt', 'code/./example.txt']) {
    await assert.rejects(checkPinnedPackage(f.path, { [path]: digest('x') }), /PACKAGE_CHECK_INPUT/);
  }
});

test('symlink root/parent/file are rejected before reading their targets', async t => {
  const f = await fixture(t);
  await symlink(join(f.path, 'code', 'example.txt'), join(f.path, 'link.txt'));
  const file = await checkPinnedPackage(f.path, { 'link.txt': digest('synthetic-public-module') });
  assert.equal(file.failures[0].code, 'UNSAFE_PACKAGE_PATH');
  await symlink(join(f.path, 'code'), join(f.path, 'alias'));
  const parent = await checkPinnedPackage(f.path, { 'alias/example.txt': digest('synthetic-public-module') });
  assert.equal(parent.failures[0].code, 'UNSAFE_PACKAGE_PATH');
  await symlink(f.path, join(f.path, 'root-alias'));
  const root = await checkPinnedPackage(join(f.path, 'root-alias'), f.pins);
  assert.equal(root.failures[0].code, 'UNSAFE_PACKAGE_PATH');
});

test('a directory or oversized file is not read as a source blob', async t => {
  const f = await fixture(t);
  await writeFile(join(f.path, 'large.txt'), Buffer.alloc(2 * 1024 * 1024 + 1));
  const report = await checkPinnedPackage(f.path, { code: digest('x'), 'large.txt': digest('x') });
  assert.deepEqual(report.failures.map(f => f.code), ['PACKAGE_FILE_LIMIT', 'PACKAGE_FILE_LIMIT']);
});
