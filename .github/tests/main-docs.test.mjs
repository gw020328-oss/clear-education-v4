import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkMarkdown, assertDocsOnly } from '../scripts/check-main-docs.mjs';

async function fixture(t, text) {
  const root = await mkdtemp(join(tmpdir(), 'clear-doc-links-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, 'README.md'), text);
  await writeFile(join(root, 'docs', 'status.md'), '# 진행 현황\n\n## 확인 결과\n\n## 확인 결과\n');
  return root;
}
test('main files, Korean/repeated headings and pinned external evidence pass', async t => {
  const root = await fixture(t, '[현황](docs/status.md#진행-현황)\n[두 번째](docs/status.md#확인-결과-1)\n[개발](https://github.com/example/repo/blob/abcdef/docs/new.md)');
  assert.equal((await checkMarkdown(root, ['README.md'])).localLinks, 2);
});
test('develop-only local files fail', async t => {
  const root = await fixture(t, '[제품](src/application/server.mjs)');
  await assert.rejects(checkMarkdown(root, ['README.md']), /MISSING_LINK/);
});
test('broken heading anchors fail', async t => {
  const root = await fixture(t, '[현황](docs/status.md#없는-제목)');
  await assert.rejects(checkMarkdown(root, ['README.md']), /MISSING_ANCHOR/);
});
test('code fences are not live documentation links', async t => {
  const root = await fixture(t, '~~~md\n[예제](absent.md)\n~~~\n[현황](docs/status.md)');
  assert.equal((await checkMarkdown(root, ['README.md'])).localLinks, 1);
});
test('encoded spaces resolve', async t => {
  const root = await fixture(t, '[안내](docs/a%20b.md)');
  await writeFile(join(root, 'docs', 'a b.md'), '# 안내');
  assert.equal((await checkMarkdown(root, ['README.md'])).localLinks, 1);
});
test('private file links and outside traversal fail', async t => {
  const root = await fixture(t, '[비공개](file:///tmp/anything)');
  await assert.rejects(checkMarkdown(root, ['README.md']), /PRIVATE_LINK/);
  await writeFile(join(root, 'README.md'), '[밖](../anything)');
  await assert.rejects(checkMarkdown(root, ['README.md']), /OUTSIDE_REPOSITORY_LINK/);
});
test('symlinks cannot disguise machine-local files as repository documentation', async t => {
  const root = await fixture(t, '[밖](docs/link)');
  await symlink(tmpdir(), join(root, 'docs', 'link'));
  await assert.rejects(checkMarkdown(root, ['README.md']), /SYMLINK_OUTSIDE_REPOSITORY/);
});
test('automation documentation branches reject mixed code, CI and historical changes', () => {
  assert.doesNotThrow(() => assertDocsOnly(['README.md', 'docs/status.md', 'docs/current/public.md']));
  for (const path of ['src/server.mjs', '.github/workflows/main-docs-ci.yml', 'docs/w02/REPORT.ko.md']) {
    assert.throws(() => assertDocsOnly(['README.md', path]));
  }
  assert.throws(() => assertDocsOnly([]));
});
