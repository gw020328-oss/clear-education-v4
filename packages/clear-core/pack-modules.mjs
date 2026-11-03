import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(process.argv[2] ?? process.cwd());
const list = JSON.parse(readFileSync(new URL('./module-files.json', import.meta.url)));
const base = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
const stage = mkdtempSync(join(tmpdir(), 'clear-module-pack-'));
try {
  const files = [];
  for (const name of list) {
    if (!/^(?:src|specs|tests|packages)\/(?:[a-z0-9.-]+\/)*[a-z0-9.-]+\.(?:mjs|json)$/.test(name)
        || name.split('/').includes('..')) throw Error('PACKAGE_PATH');
    const bytes = readFileSync(join(root, name));
    const target = join(stage, name);
    mkdirSync(dirname(target), {recursive: true});
    writeFileSync(target, bytes);
    files.push({path: name, sha256: createHash('sha256').update(bytes).digest('hex')});
  }
  writeFileSync(join(stage, 'README.md'), readFileSync(new URL('./README.md', import.meta.url)));
  writeFileSync(join(stage, 'source-manifest.json'), JSON.stringify({files}, null, 2));
  writeFileSync(join(stage, 'package.json'), JSON.stringify({
    ...base,
    version: '0.3.0',
    exports: {
      '.': './packages/clear-core/src/index.mjs',
      './modules': './src/agent-preview/packaged-modules.mjs',
      './gemini': './src/agent-preview/gemini-response.mjs'
    },
    files: [...list, 'source-manifest.json'],
    dependencies: {'@reclaimprotocol/attestor-core': '5.1.4', ethers: '6.17.0', parse5: '8.0.1'}
  }, null, 2));
  mkdirSync(output, {recursive: true});
  execFileSync('npm', ['pack', '--offline', '--ignore-scripts', '--pack-destination', output], {
    cwd: stage, stdio: 'inherit'
  });
} finally {
  rmSync(stage, {recursive: true, force: true});
}
