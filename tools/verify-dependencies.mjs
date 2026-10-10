import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { keccak256, toUtf8Bytes, version as ethersVersion } from 'ethers';
import solc from 'solc';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
assert.equal(ethersVersion, packageJson.dependencies.ethers);
assert.ok(solc.version().startsWith(`${packageJson.dependencies.solc}+`));
for (const [name, version] of Object.entries(packageJson.dependencies)) {
  const installed = JSON.parse(await readFile(new URL(`node_modules/${name}/package.json`, root), 'utf8'));
  assert.equal(installed.version, version);
}
assert.equal(keccak256(toUtf8Bytes('')), '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
const path = new URL('legacy/stage15/contracts/RefundVault.sol', root);
const content = await readFile(path, 'utf8');
const output = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity', sources: { 'RefundVault.sol': { content } },
  settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
})));
const errors = (output.errors ?? []).filter((error) => error.severity === 'error');
assert.equal(errors.length, 0, 'Legacy source must compile with pinned compiler');
assert.ok(Object.keys(output.contracts?.['RefundVault.sol'] ?? {}).length);
console.log(JSON.stringify({ result: 'PASS', dependencies: packageJson.dependencies, legacyCompileSource: fileURLToPath(path), compiledInMemory: true, deployed: false, chainStarted: false, ganacheRuntimeCompatibility: 'NOT_TESTED' }));
