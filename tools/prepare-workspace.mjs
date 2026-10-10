// Creates empty ignored directories only; starts no service and collects no proof.
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, lstat, chmod } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
async function protectLegacy(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'Legacy source may not contain symlinks');
    if (entry.isDirectory()) await protectLegacy(child);
    else {
      assert.ok(entry.isFile());
      await chmod(child, 0o444);
    }
  }
}
await protectLegacy(resolve(root, 'legacy'));
for (const file of await readdir(resolve(root, 'config/environments'))) {
  if (!file.endsWith('.json')) continue;
  const config = JSON.parse(await readFile(resolve(root, 'config/environments', file), 'utf8'));
  assert.equal(config.schemaVersion, 4);
  assert.equal(config.mayStartProductServices, false);
  for (const path of Object.values(config.paths)) {
    assert.ok(!path.startsWith('/') && !path.split('/').includes('..'));
    let current = root;
    for (const component of path.split('/')) {
      current = resolve(current, component);
      assert.ok(relative(root, current) && !relative(root, current).startsWith(`..${sep}`));
      await mkdir(current, { mode: 0o700 }).catch((error) => {
        if (error.code !== 'EEXIST') throw error;
      });
      assert.ok((await lstat(current)).isDirectory(), 'Data directories may not be symlinks');
      await chmod(current, 0o700);
    }
  }
}
console.log('Empty ignored workspace paths prepared. Proof storage is NOT ready; services remain disabled.');
