import { readFile } from 'node:fs/promises';
import { checkPinnedPackage } from './package-check.mjs';

// Requires an explicit path to the already shared public experiment package.
// Does not discover/read Docker config, .env, token fixtures, DBs or browsers.
if (process.argv.length !== 4 || process.argv[2] !== '--source-package') {
  console.error('USAGE: preflight.mjs --source-package ABSOLUTE_PUBLIC_PACKAGE_DIRECTORY');
  process.exitCode = 1;
} else {
  try {
    const pins = JSON.parse(await readFile(new URL('./source-pins.json', import.meta.url), 'utf8'));
    const report = await checkPinnedPackage(process.argv[3], pins.files);
    console.log(JSON.stringify(report, null, 2));
    if (report.failures.length) process.exitCode = 1;
  } catch {
    console.error('PACKAGE_CHECK_FAILED');
    process.exitCode = 1;
  }
}
