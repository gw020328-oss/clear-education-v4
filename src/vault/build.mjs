import { readFileSync } from 'node:fs';
import solc from 'solc';
import { keccak256 } from 'ethers';

let cached;
export function buildVault() {
  if (cached) return cached;
  const names = ['ClearTestToken.sol', 'CourseRefundVaultV4.sol'];
  const sources = Object.fromEntries(names.map(name => [name, { content: readFileSync(new URL('../../contracts/' + name, import.meta.url), 'utf8') }]));
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources,
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'shanghai',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } } })));
  if (output.errors?.some(e => e.severity === 'error')) throw new Error('VAULT_COMPILE_FAILED');
  cached = Object.fromEntries(names.map(name => {
    const artifact = output.contracts[name][name.slice(0, -4)];
    return [name.slice(0, -4), Object.freeze({ abi: artifact.abi, bytecode: '0x' + artifact.evm.bytecode.object,
      runtimeBytecode: '0x' + artifact.evm.deployedBytecode.object, codeHash: keccak256('0x' + artifact.evm.deployedBytecode.object) })];
  }));
  return Object.freeze(cached);
}
