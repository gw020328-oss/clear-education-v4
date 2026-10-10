import { readFileSync } from 'node:fs';
import solc from 'solc';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, Wallet, keccak256 } from 'ethers';
import { AMOUNT, EXPIRY, STATEMENT, termsHash, SAFE_TOKEN_CODE_HASH } from './evidence.mjs';

let artifacts;
export function compile() {
  if(artifacts) return artifacts;
  const names=['TestToken.sol','FreezableTestToken.sol','RefundVault.sol'];
  const sources=Object.fromEntries(names.map(name=>[name,{content:readFileSync(new URL('../contracts/'+name,import.meta.url),'utf8')}]))
  const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}})));
  if((compiled.errors??[]).some(e=>e.severity==='error')) throw new Error('SOLIDITY_COMPILE_FAILED');
  artifacts={TestToken:compiled.contracts['TestToken.sol'].TestToken,FreezableTestToken:compiled.contracts['FreezableTestToken.sol'].FreezableTestToken,RefundVault:compiled.contracts['RefundVault.sol'].RefundVault};
  const safeHash=keccak256('0x'+artifacts.TestToken.evm.deployedBytecode.object);
  if(safeHash!==SAFE_TOKEN_CODE_HASH) throw new Error('SAFE_TOKEN_POLICY_HASH_STALE');
  return artifacts;
}

export async function localFixture({tokenKind='safe',chainId=31337,startTime='2026-09-13T00:00:00Z'}={}) {
  const rpc=ganache.provider({logging:{quiet:true},chain:{chainId,hardfork:'shanghai',time:new Date(startTime)},miner:{timestampIncrement:0},wallet:{totalAccounts:7}});
  const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1}); provider.pollingInterval=10;
  const wallets=Object.values(rpc.getInitialAccounts()).map(a=>new Wallet(a.secretKey));
  const [sponsorWallet,learner,issuer,attacker,other]=wallets;
  const sponsor=await provider.getSigner(sponsorWallet.address), relayer=await provider.getSigner(attacker.address), compiled=compile();
  async function deploy(name,args=[]){const a=compiled[name];const c=await new ContractFactory(a.abi,a.evm.bytecode.object,sponsor).deploy(...args);await c.waitForDeployment();return c;}
  async function now(){return Number((await rpc.request({method:'eth_getBlockByNumber',params:['latest',false]})).timestamp);}
  async function setTime(time){await rpc.request({method:'evm_setTime',params:[time*1000]});await rpc.request({method:'evm_mine',params:[]});}
  try {
    const token=await deploy(tokenKind==='safe'?'TestToken':'FreezableTestToken',tokenKind==='safe'?[]:[AMOUNT*3n]);
    const start=await now()+10;
    const terms={version:1,courseId:'refund-course-001',submissionIds:[0,1,2,3],amount:AMOUNT.toString(),tokenDecimals:6,tokenSymbol:'TEST',chainId:31337,token:token.target,issuer:issuer.address,sponsor:sponsorWallet.address,start,due:start+86400,claimUntil:start+86400+604800,expiryPolicy:EXPIRY,evidenceStatement:STATEMENT};
    const hash=termsHash(terms),vault=await deploy('RefundVault',[token.target,issuer.address,hash,terms.start,terms.due,terms.claimUntil]);
    const deployment=await vault.deploymentTransaction().wait(); await (await token.approve(vault.target,AMOUNT*3n)).wait();
    const trusted={manifestVersion:2,tokenProfile:'immutable-fixed-test-token/v1',terms,termsHash:hash,domain:{name:'RefundRights',version:'2',chainId:31337,verifyingContract:vault.target},deployment:{genesisHash:(await rpc.request({method:'eth_getBlockByNumber',params:['0x0',false]})).hash,blockNumber:deployment.blockNumber,blockHash:deployment.blockHash,vaultCodeHash:keccak256(await provider.getCode(vault.target)),tokenCodeHash:keccak256(await provider.getCode(token.target))}};
    return {rpc,provider,wallets,learner,issuer,attacker,other,sponsor,relayer,token,vault,trusted,deploy,now,setTime,async close(){provider.destroy();await rpc.disconnect();}};
  } catch(e){provider.destroy();await rpc.disconnect();throw e;}
}
