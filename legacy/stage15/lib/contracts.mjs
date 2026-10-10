import fs from 'node:fs';
import solc from 'solc';
import {compile as legacyCompile} from '../../stage6/lib/local.mjs';
let artifacts;
export function compile() {
  if (artifacts) return artifacts;
  const sources={'ClearRefundVaultV3.sol':{content:fs.readFileSync(new URL('../contracts/RefundVault.sol',import.meta.url),'utf8')}};
  const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}})));
  const errors=(output.errors??[]).filter(e=>e.severity==='error');
  if(errors.length)throw Error(errors.map(e=>e.formattedMessage).join('\n'));
  // Preserve the original token compilation exactly; its trusted bytecode hash is unchanged.
  artifacts={...legacyCompile(),RefundVault:output.contracts['ClearRefundVaultV3.sol'].RefundVault};
  return artifacts;
}
