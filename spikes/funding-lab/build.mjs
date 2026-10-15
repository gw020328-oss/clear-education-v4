import { readFileSync } from 'node:fs';
import solc from 'solc';
import { keccak256 } from 'ethers';
let cached;
export function buildLab() {
  if (cached) return cached;
  const sources = {
    'ClearTestToken.sol': { content: readFileSync(new URL('../../contracts/ClearTestToken.sol', import.meta.url), 'utf8') },
    'FundingLab.sol': { content: readFileSync(new URL('./FundingLab.sol', import.meta.url), 'utf8') },
  };
  const out = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings: {
    optimizer: { enabled: true, runs: 200 }, evmVersion: 'shanghai',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
  } })));
  if (out.errors?.some(e => e.severity === 'error')) throw new Error(out.errors.filter(e => e.severity === 'error').map(e => e.formattedMessage).join('\n'));
  cached = Object.fromEntries(Object.keys(sources).map(file => {
    const name = file.slice(0, -4), a = out.contracts[file][name], runtime = '0x' + a.evm.deployedBytecode.object;
    return [name, { abi: a.abi, bytecode: '0x' + a.evm.bytecode.object, runtime, codeHash: keccak256(runtime) }];
  }));
  return cached;
}
