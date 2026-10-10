import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import * as ethers from 'ethers';
import {localFixture,compile as oldCompile} from '../../stage6/lib/local.mjs';
import {acceptanceTypes as oldAcceptanceTypes} from '../../stage6/lib/evidence.mjs';
import {packet,statement,cachedDraft,reviewFromDraft} from '../../stage14/policy/product.mjs';
import {approveReview,providerCommitment,participantEnrollment,createCompiler} from '../policy/binding.mjs';
import {compile} from '../lib/contracts.mjs';
import {runtimeConfig} from '../shared/runtime.mjs';
import {acceptanceValue,acceptanceTypes,receiptTypes,domain,hashConfig,runtimeConfigHash,deployBound,enrollBound,makeReceipts} from '../lib/chain.mjs';
import {CentralVault} from '../lib/central.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const tracked=['TEST_PLAN.md','contracts/RefundVault.sol','shared/runtime.mjs','lib/contracts.mjs','lib/chain.mjs','lib/central.mjs','policy/core.mjs','policy/binding.mjs','tests/runtime-binding.mjs'];
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(root+p)).digest('hex');
const inputHashes=Object.fromEntries(tracked.map(p=>[p,sha(p)]));
const id=new Date().toISOString().replaceAll(':','-'),out=root+'artifacts/runtime-'+id;
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(out+'/inputs.json',JSON.stringify({at:new Date().toISOString(),inputHashes,paidAPICalls:0,realMoney:0},null,2),{flag:'wx'});
const results=[];
const outcome=async fn=>{try{return {allowed:true,value:await fn()};}catch(e){return {allowed:false,error:e.code??e.message,receiptStatus:e.receipt?.status??null,transactionHash:e.receipt?.hash??null};}};
async function run(id,group,fn){try{const details=await fn();results.push({id,group,passed:true,...details});}catch(e){results.push({id,group,passed:false,error:e.message});}console.log(JSON.stringify(results.at(-1)));}
let chain;
try{
 chain=await localFixture({startTime:'2030-01-01T00:00:00Z'});
 const now=await chain.now(),payer=chain.wallets[0],source=packet(statement);
 const review=await approveReview({...reviewFromDraft(cachedDraft(source)),confirmed:true},source,{token:chain.token.target,issuer:chain.issuer.address,reviewer:ethers.Wallet.createRandom(),payer:payer.address,now});
 const address=ethers.getCreateAddress({from:payer.address,nonce:Number(await chain.provider.send('eth_getTransactionCount',[payer.address,'pending']))}).toLowerCase();
 const bundle={reviewed:review.reviewed,provider:await providerCommitment(review.reviewed,address,payer),enrollment:await participantEnrollment(review.reviewed,address,chain.learner,now)};
 const compiler=createCompiler(review.trust),plan=compiler(bundle,now),t=plan.nativeTerms,cfg=runtimeConfig(plan);
 const av=acceptanceValue(plan),validConsent={...av,signature:await chain.learner.signTypedData(domain(plan),acceptanceTypes,av)};
 const receipts=await makeReceipts(plan,chain.issuer,now);
 async function branch(fn){const snap=await chain.provider.send('evm_snapshot',[]);try{return await fn();}finally{assert.equal(await chain.provider.send('evm_revert',[snap]),true);}}
 async function rawDeploy(changes={}){
  const params={token:t.token,verifier:t.issuer,termsHash:plan.termsHash,start:t.start,due:t.due,claimUntil:t.claimUntil,...changes};const a=compile().RefundVault;
  const vault=await new ethers.ContractFactory(a.abi,a.evm.bytecode.object,chain.sponsor).deploy(params.token,params.verifier,params.termsHash,params.start,params.due,params.claimUntil);await vault.waitForDeployment();assert.equal(vault.target.toLowerCase(),t.vaultAddress);
  return {vault,actual:{...cfg,token:params.token,verifier:params.verifier,start:params.start,due:params.due,claimUntil:params.claimUntil},params};
 }
 async function mined(promise){const tx=await promise,r=await tx.wait();return {transactionHash:r.hash,receiptStatus:r.status,gasUsed:r.gasUsed.toString()};}
 await run('native-config-hash-and-version-match','binding_positive',()=>branch(async()=>{
  const {vault}=await rawDeploy();assert.equal(await vault.runtimeConfigHash(),runtimeConfigHash(plan));assert.equal(await vault.configVersion(),3n);assert.equal(await vault.requiredReceipts(),4n);
  const explicitHash=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32','uint32','address','address','address','uint256','uint32','uint64','uint64','uint64'],[ethers.id('RuntimeConfig(uint32 version,address token,address sponsor,address verifier,uint256 amount,uint32 requiredReceipts,uint64 start,uint64 due,uint64 claimUntil)'),3,t.token,t.sponsor,t.issuer,50000000,4,t.start,t.due,t.claimUntil]));assert.equal(explicitHash,await vault.runtimeConfigHash());return {runtimeConfigHash:explicitHash};
 }));
 // Every case below submits a mined raw transaction; it does not rely on inspectBound.
 async function rejectedEnrollment(id,{changes={},consent=validConsent,actualHashArgument=false,learner=t.recipient,time=t.enrolledAt,follow=null,oldSelector=false}={}){
  await run(id,'binding_rejections',()=>branch(async()=>{
   const {vault,actual,params}=await rawDeploy(changes);await(await chain.token.connect(chain.sponsor).approve(vault.target,50000000n)).wait();
   const configHash=actualHashArgument?await vault.runtimeConfigHash():consent.runtimeConfigHash;
   let rejectionReason=null;
   if(!oldSelector){
    const expectedReason=configHash===hashConfig(actual)?'CONSENT':'CONFIG_MISMATCH';
    try{await vault.connect(chain.sponsor).enroll.staticCall(learner,time,configHash,consent.signature);assert.fail('STATIC_CALL_SHOULD_REJECT');}
    catch(e){assert.equal(e.reason,expectedReason);rejectionReason=e.reason;}
   }
   let cv;const central=await outcome(()=>{cv=new CentralVault(plan,{...consent,runtimeConfigHash:configHash},{config:actual,termsHash:params.termsHash,learner,acceptedAt:time,now});return true;});cv?.close();
   const evm=await outcome(()=>oldSelector?mined(chain.sponsor.sendTransaction({to:vault.target,data:new ethers.Interface(oldCompile().RefundVault.abi).encodeFunctionData('enroll',[learner,time,consent.signature]),gasLimit:1000000})):mined(vault.connect(chain.sponsor).enroll(learner,time,configHash,consent.signature,{gasLimit:1000000})));
   assert.equal(central.allowed,false);assert.equal(evm.allowed,false);assert.equal(evm.receiptStatus,0);
   assert.equal(await vault.enrolled(t.recipient),false);assert.equal(await vault.totalReserved(),0n);assert.equal(await chain.token.balanceOf(vault.target),0n);
   let followup;
   if(follow){await chain.setTime(follow==='reclaim'?params.claimUntil+1:t.claimUntil+1);followup=await outcome(()=>follow==='reclaim'?mined(vault.connect(chain.sponsor).reclaimExpired(t.recipient,{gasLimit:1000000})):mined(vault.connect(chain.relayer).claim(t.recipient,receipts.map(r=>r.receipt),receipts.map(r=>r.signature),{gasLimit:1000000})));assert.equal(followup.allowed,false);assert.equal(followup.receiptStatus,0);}
   return {central,evm,followup,rejectionReason,enrolled:false,reservedUnits:'0',originalTermsHashPreserved:params.termsHash===plan.termsHash};
  }));
 }
 await rejectedEnrollment('deadline-shorter-same-hash',{changes:{claimUntil:t.claimUntil-86400},follow:'reclaim'});
 await rejectedEnrollment('deadline-longer-same-hash',{changes:{claimUntil:t.claimUntil+86400},follow:'claim'});
 await rejectedEnrollment('deadline-shorter-swap-hash-keep-signature',{changes:{claimUntil:t.claimUntil-86400},actualHashArgument:true,follow:'reclaim'});
 await rejectedEnrollment('deadline-longer-swap-hash-keep-signature',{changes:{claimUntil:t.claimUntil+86400},actualHashArgument:true,follow:'claim'});
 for(const [id,changes] of [['issuer',{verifier:chain.other.address}],['token',{token:chain.other.address}],['start',{start:t.start-1}],['due',{due:t.due+1}],['terms-hash',{termsHash:'0x'+'11'.repeat(32)}]])await rejectedEnrollment('actual-'+id+'-changed',{changes});
 for(const [field,value] of [['amount','60000000'],['requiredReceipts',3],['sponsor',chain.other.address],['version',2]]){
  const valueToSign={...av,runtimeConfigHash:hashConfig({...cfg,[field]:value})};const consent={...valueToSign,signature:await chain.learner.signTypedData(domain(plan),acceptanceTypes,valueToSign)};
  await rejectedEnrollment('signed-'+field+'-different',{consent});
  await rejectedEnrollment('signed-'+field+'-hash-replaced-not-resigned',{consent,actualHashArgument:true});
 }
 for(const [id,dm] of [['wrong-chain',{...domain(plan),chainId:1}],['wrong-vault',{...domain(plan),verifyingContract:chain.other.address}],['wrong-domain-version',{...domain(plan),version:'2'}]])await rejectedEnrollment(id,{consent:{...av,signature:await chain.learner.signTypedData(dm,acceptanceTypes,av)}});
 await rejectedEnrollment('wrong-participant-signer',{consent:{...av,signature:await chain.other.signTypedData(domain(plan),acceptanceTypes,av)}});
 await rejectedEnrollment('recipient-substitution',{learner:chain.other.address});
 await rejectedEnrollment('accepted-time-substitution',{time:t.enrolledAt-1});
 const v2={termsHash:av.termsHash,learner:av.learner,acceptedAt:av.acceptedAt};
 const oldSig=await chain.learner.signTypedData({...domain(plan),version:'2'},oldAcceptanceTypes,v2);
 await rejectedEnrollment('old-v2-signature',{consent:{...av,signature:oldSig}});
 await rejectedEnrollment('old-v2-enroll-selector',{consent:{...av,signature:oldSig},oldSelector:true});
 await run('new-consent-to-updated-runtime-succeeds','binding_positive',()=>branch(async()=>{
  const changed=structuredClone(plan);changed.nativeTerms.claimUntil+=86400;
  const ac=acceptanceValue(changed),consent={...ac,signature:await chain.learner.signTypedData(domain(changed),acceptanceTypes,ac)},central=new CentralVault(changed,consent);
  try{const {vault}=await rawDeploy({claimUntil:changed.nativeTerms.claimUntil});await(await chain.token.connect(chain.sponsor).approve(vault.target,50000000n)).wait();const r=await mined(vault.connect(chain.sponsor).enroll(t.recipient,t.enrolledAt,ac.runtimeConfigHash,consent.signature,{gasLimit:1000000}));assert.equal(await vault.enrolled(t.recipient),true);assert.equal(await vault.totalReserved(),50000000n);return {centralAllowed:true,evm:r,note:'Runtime-consent unit test only; re-review of natural-language policy is still required by the normal app.'};}finally{central.close();}
 }));
 await run('replayed-enrollment-no-second-deposit','binding_rejections',()=>branch(async()=>{
  const {vault}=await rawDeploy();await(await chain.token.connect(chain.sponsor).approve(vault.target,100000000n)).wait();await mined(vault.connect(chain.sponsor).enroll(t.recipient,t.enrolledAt,av.runtimeConfigHash,validConsent.signature,{gasLimit:1000000}));
  const r=await outcome(()=>mined(vault.connect(chain.sponsor).enroll(t.recipient,t.enrolledAt,av.runtimeConfigHash,validConsent.signature,{gasLimit:1000000})));assert.equal(r.allowed,false);assert.equal(r.receiptStatus,0);assert.equal(await vault.totalReserved(),50000000n);assert.equal(await chain.token.balanceOf(vault.target),50000000n);return {evm:r,centralCompared:false};
 }));

 // Keep the previous 19 settlement scenarios, now on a normally deployed v3 vault.
 const deployed=await deployBound(compiler,bundle,chain.provider,chain.sponsor),acceptance=await enrollBound(compiler,bundle,chain.provider,deployed.anchor,chain.sponsor,chain.learner);
 async function signReceipts({changes={},signer=chain.issuer,dm=domain(plan)}={}){return Promise.all(receipts.map(async x=>{const receipt={...x.receipt,...changes};return {receipt,signature:await signer.signTypedData(dm,receiptTypes,receipt)};}));}
 async function settlement(id,{items=receipts,recipient=t.recipient,at=now,allow=false,mode='claim',caller='relayer',duplicate=false}={}){
  await run(id,'settlement',()=>branch(async()=>{
   const central=new CentralVault(plan,acceptance);try{
    await chain.setTime(at);const ccall=()=>mode==='claim'?central.claim(recipient,items,at):central.reclaim(caller==='sponsor'?t.sponsor:chain.attacker.address,at);
    const signer=caller==='sponsor'?chain.sponsor:caller==='learner'?await chain.provider.getSigner(chain.learner.address):chain.relayer;
    const ecall=()=>mode==='claim'?mined(deployed.vault.connect(signer).claim(recipient,items.map(x=>x.receipt),items.map(x=>x.signature),{gasLimit:1000000})):mined(deployed.vault.connect(signer).reclaimExpired(recipient,{gasLimit:1000000}));
    if(duplicate){await ccall();await ecall();}
    const c=await outcome(ccall),e=await outcome(ecall);assert.equal(c.allowed,allow);assert.equal(e.allowed,allow);assert.equal(e.value?.receiptStatus??e.receiptStatus,allow?1:0);
    const paid=mode==='claim'&&(allow||duplicate),returned=mode==='reclaim'&&allow,reserve=paid||returned?0n:50000000n;
    assert.equal(await chain.token.balanceOf(t.recipient),paid?50000000n:0n);assert.equal(await deployed.vault.totalReserved(),reserve);assert.equal(await deployed.vault.settled(t.recipient),paid||returned);
    assert.equal(central.status().paid,paid?50000000:0);assert.equal(central.status().reserve,Number(reserve));assert.equal(central.status().returned,returned?50000000:0);
    return {expectedAllowed:allow,central:{allowed:c.allowed,error:c.error??null},evm:e,balancesVerified:true};
   }finally{central.close();}
  }));
 }
 await settlement('normal-participant-claim',{allow:true,caller:'learner'});
 await settlement('normal-third-party-relay',{allow:true});
 await settlement('exact-deadline-claim',{allow:true,at:t.claimUntil});
 await settlement('after-deadline-claim',{at:t.claimUntil+1});
 await settlement('insufficient-three-receipts',{items:receipts.slice(0,3)});
 await settlement('duplicate-session',{items:[receipts[0],receipts[0],receipts[2],receipts[3]]});
 await settlement('wrong-issuer',{items:await signReceipts({signer:chain.other})});
 await settlement('receipt-wrong-terms',{items:await signReceipts({changes:{termsHash:'0x'+'11'.repeat(32)}})});
 await settlement('receiver-substitution',{recipient:chain.other.address.toLowerCase()});
 await settlement('receipt-other-recipient',{items:await signReceipts({changes:{learner:chain.other.address}})});
 await settlement('receipt-edited-after-signing',{items:receipts.map(x=>({receipt:{...x.receipt,completedAt:now+1},signature:x.signature})),at:now+1});
 await settlement('receipt-wrong-chain',{items:await signReceipts({dm:{...domain(plan),chainId:1}})});
 await settlement('receipt-wrong-vault',{items:await signReceipts({dm:{...domain(plan),verifyingContract:chain.other.address}})});
 await settlement('future-completion',{items:await signReceipts({changes:{completedAt:now+1}})});
 await settlement('before-start-completion',{items:await signReceipts({changes:{completedAt:t.start-1}})});
 await settlement('duplicate-payment',{duplicate:true});
 await settlement('early-sponsor-reclaim',{mode:'reclaim',caller:'sponsor'});
 await settlement('unauthorized-expired-reclaim',{mode:'reclaim',at:t.claimUntil+1});
 await settlement('normal-expired-reclaim',{mode:'reclaim',caller:'sponsor',at:t.claimUntil+1,allow:true});
}catch(e){results.push({id:'setup-or-harness',group:'infrastructure',passed:false,error:e.message});}finally{if(chain)await chain.close();}
const unchanged=Object.entries(inputHashes).every(([p,h])=>sha(p)===h);
const groups=Object.fromEntries([...new Set(results.map(r=>r.group))].map(g=>{const rows=results.filter(r=>r.group===g);return [g,{total:rows.length,passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length}];}));
const report={at:new Date().toISOString(),inputHashes,inputsUnchanged:unchanged,groups,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results,scope:'LOCAL_REPAIR_REGRESSION_NOT_SECURITY_AUDIT',paidAPICalls:0,realMoney:0};
fs.writeFileSync(out+'/results.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,groups,failed:report.failed,inputsUnchanged:unchanged}));process.exitCode=report.failed||!unchanged?1:0;
