// Local EVM model, fabricated signatures/facts. No real Reclaim proof accepted.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../package.json',import.meta.url));
const {Wallet,BrowserProvider,ContractFactory,id}=require('ethers'),solc=require('solc');
const warn=console.warn;console.warn=()=>{};const ganache=require('ganache');console.warn=warn;
const source=fs.readFileSync(new URL('BoundedAdapter.sol',import.meta.url),'utf8');
const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'BoundedAdapter.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
assert.equal((compiled.errors??[]).filter(e=>e.severity==='error').length,0);
const g=ganache.provider({logging:{quiet:true},chain:{chainId:431798,hardfork:'shanghai'},wallet:{totalAccounts:2}});
const provider=new BrowserProvider(g),sponsor=await provider.getSigner(0),relayer=await provider.getSigner(1);
const learner=Wallet.createRandom(),otherLearner=Wallet.createRandom(),owner=Wallet.createRandom(),witness=Wallet.createRandom(),recipient=Wallet.createRandom();
const tests=[];
async function check(name,fn){try{await fn();tests.push({name,status:'PASS'});}catch(e){tests.push({name,status:'FAIL',reason:e.shortMessage??e.code??'ASSERTION'});}}
async function deploy(name,args){const c=compiled.contracts['BoundedAdapter.sol'][name];const v=await new ContractFactory(c.abi,c.evm.bytecode.object,sponsor).deploy(...args);await v.waitForDeployment();return v;}
try{
 const verifier=await deploy('FixtureSignatureVerifier',[witness.address]);
 const vault=await deploy('BoundedAdapter',[await verifier.getAddress(),id('SYNTHETIC_CLEAR_PROGRAM'),id('SYNTHETIC_POLICY'),1]);
 const apps=[id('synthetic-app-a'),id('synthetic-app-b'),id('synthetic-app-c')];
 for(let i=0;i<apps.length;i++)await(await vault.enroll(apps[i],i===0?learner.address:otherLearner.address,recipient.address,{value:1000n})).wait();
 const base={application:apps[0],owner:owner.address,recipient:recipient.address,sourcePolicy:id('SYNTHETIC_POLICY'),nullifier:id('SYNTHETIC_NULLIFIER_ASSUMED_STABLE'),timestamp:Number((await provider.getBlock('latest')).timestamp),epoch:1};
 const sign=async(c,l=learner)=>[c,l.signingKey.sign(await vault.bindingDigest(c.application,c.owner)).serialized,witness.signingKey.sign(await vault.claimDigest(c)).serialized];
 await check('model verifier returns false without revert for valid fabricated signature',async()=>assert.equal(await verifier.verify.staticCall(await vault.claimDigest(base),(await sign(base))[2]),false));
 for(const [name,patch] of [['wrong fixed recipient',{recipient:owner.address}],['wrong source policy',{sourcePolicy:id('evil-policy')}],['wrong epoch',{epoch:2}],['expired proof',{timestamp:base.timestamp-3600}],['future proof',{timestamp:base.timestamp+120}],['zero nullifier',{nullifier:'0x'+'00'.repeat(32)}]]){
  await check(name+' rejected',async()=>assert.rejects(vault.claim.staticCall(...await sign({...base,...patch}))));
 }
 await check('different learner cannot delegate owner for application',async()=>assert.rejects(vault.claim.staticCall(...await sign(base,otherLearner))));
 await check('owner alteration without fresh learner delegation rejected',async()=>{
  const a=await sign(base),b={...base,owner:otherLearner.address};await assert.rejects(vault.claim.staticCall(b,a[1],(await sign(b))[2]));
 });
 await check('unsigned proof facts rejected',async()=>{const a=await sign(base);await assert.rejects(vault.claim.staticCall({...base,nullifier:id('tamper')},a[1],a[2]));});
 const amount=async()=>BigInt(await g.request({method:'eth_getBalance',params:[recipient.address,'latest']}));
 await check('API-free local relayer payout reaches fixed recipient',async()=>{
  const before=await amount();await(await vault.connect(relayer).claim(...await sign(base))).wait();assert.equal(await amount()-before,1000n);
 });
 await check('same application cannot claim twice',async()=>assert.rejects(vault.claim.staticCall(...await sign(base))));
 await check('same supplied business nullifier rejected for another wallet/application',async()=>assert.rejects(vault.claim.staticCall(...await sign({...base,application:apps[1]},otherLearner))));
 await check('counterexample: changed supplied nullifier accepted for another application',async()=>{
  // Same conceptual exam, but fixture signer supplies a different N. The model
  // cannot establish that N derives from an authentic stable exam identifier.
  const before=await amount();await(await vault.connect(relayer).claim(...await sign({...base,application:apps[2],nullifier:id('UNTRUSTED_REISSUED_NULLIFIER')},otherLearner))).wait();assert.equal(await amount()-before,1000n);
 });
 const report={mode:'LOCAL_EVM_SYNTHETIC_FACT_MODEL',compiler:solc.version(),tests,checksPassed:tests.filter(t=>t.status==='PASS').length,checksFailed:tests.filter(t=>t.status==='FAIL').length,localPayout:true,qualificationStatus:'NO_GO_SOURCE_BOUND_NULLIFIER_UNIMPLEMENTED',realReclaimProof:false,privacyCircuit:false,independentCollection:false,
 limits:['Fixture verifier trusts fabricated test witness facts: not a Reclaim verifier or replacement CLEAR pass signature proposal','Initial enrollment assumed; existing vault has no upgrade/migration path','Same nullifier dedup works, same exam dedup remains unproved','No actual score/date relation is verified in this adapter','No inventory/attendance/real YBM/Windows/public transaction'],checkedAt:new Date().toISOString()};
 fs.writeFileSync(new URL('adapter-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.checksFailed)process.exitCode=1;
}finally{await g.disconnect();}
