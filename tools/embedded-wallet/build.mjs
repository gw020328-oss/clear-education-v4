import {mkdirSync, copyFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {reviewedDependencies} from './reviewed-dependencies.mjs';
reviewedDependencies();
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(new URL('../../src/embedded-wallet/package.json', import.meta.url));
const {build} = require('esbuild');
const outdir = root + 'var/embedded-wallet-build';
mkdirSync(outdir, {recursive: true});
await build({absWorkingDir: root, entryPoints: {onboarding: 'src/embedded-wallet/onboarding.jsx', operator: 'src/embedded-wallet/operator.jsx',
  adapter: 'src/embedded-wallet/exports.mjs'}, outdir, bundle: true, splitting: true, format: 'esm', platform: 'browser',
  target: ['chrome120'], minify: true, sourcemap: false, legalComments: 'external',
  define: {'process.env.NODE_ENV': '"production"'}, logLevel: 'warning'});
copyFileSync(root + 'src/embedded-wallet/style.css', outdir + '/style.css');
writeFileSync(outdir + '/build-info.json', JSON.stringify({sdk: '@privy-io/react-auth', version: '3.51.0',
  liveLoginVerified: false, liveRestorationVerified: false}, null, 2) + '\n');
console.log('Embedded wallet bundle built; actual SDK login remains unverified.');
