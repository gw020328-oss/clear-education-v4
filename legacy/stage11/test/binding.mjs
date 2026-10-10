import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Wallet,getCreateAddress} from 'ethers';
import {fixture} from './fixture.mjs';
import {createCompiler,canonical,H,signReview,reviewPayload,sourcePacket} from '../policy-binding/core.mjs';
import {deployBound,inspectBound,enrollBound,makeReceipts,claimBound} from '../policy-binding/chain.mjs';
import {runtimeGate} from '../../stage10/protocol-v2/tools/runtime-gate.mjs';
import {localFixture} from '../../stage6/lib/local.mjs';
const root=new URL('../',import.meta.url),expected=JSON.parse(fs.readFileSync(new URL('test/EXPECTED.json',root))),results=[];
const out=fs.mkdtempSync(fileURLToPath(new URL('artifacts/binding-',root)));
const f=await fixture();
const generatedSecrets=[f.reviewer,f.payer,f.participant,f.issuer,f.other].map(w=>w.privateKey);
const run=async(id,fn)=>{try{const detail=await fn();results.push({id,pass:true,detail});console.log('PASS '+id);}catch(e){results.push({id,pass:false,error:e.code??e.message});console.log('FAIL '+id+' '+(e.code??e.message));}};
await run('native-exact',()=>{const p=f.compiler(f.bundle,f.start);assert.equal(p.nativeTerms.amount,'50000000');assert.deepEqual(p.nativeTerms.submissionIds,[0,1,2,3]);assert.equal(p.termsHash,H(p.commitment));return {termsHash:p.termsHash,readiness:p.readiness};});
await run('property-order-and-json-whitespace',()=>{const reverse=v=>Array.isArray(v)?v.map(reverse):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverse(x)])):v;const b=JSON.parse(JSON.stringify(reverse(f.bundle),null,4));assert.equal(f.compiler(b,f.start).termsHash,f.compiler(f.bundle,f.start).termsHash);});
await run('exact-claim-boundary',()=>{assert.equal(f.compiler(f.bundle,f.c.periods.claimUntil).compilable,true);});
await run('same-policy-two-recipients',async()=>{const a=f.compiler(f.bundle,f.start),b=f.compiler(await f.enrollment(f.other,'0x6666666666666666666666666666666666666666'),f.start);assert.equal(a.commitment.policySpecHash,b.commitment.policySpecHash);assert.notEqual(a.termsHash,b.termsHash);assert.notEqual(a.nativeTerms.recipient,b.nativeTerms.recipient);});
const mutations={
 'profile-override':b=>b.profile={kind:'NATIVE_FIXED_FOUR'},
 'amount-change':b=>b.reviewed.conditions.amount='49000000',
 'decimals-change':b=>b.reviewed.conditions.asset.decimals=18,
 'currency-change':b=>b.reviewed.conditions.asset.symbol='KRW',
 'token-change':b=>b.provider.asset.token='0x7777777777777777777777777777777777777777',
 'activities-change':b=>b.reviewed.conditions.activities={kind:'ATTENDANCE',percent:90},
 'completion-change':b=>b.provider.due++,
 'claim-change':b=>b.enrollment.claimUntil++,
 'exceptions-deleted':b=>delete b.reviewed.conditions.exceptions,
 'approval-change':b=>b.reviewed.conditions.approvalRole='SCHOOL_DISCRETION',
 'citation-change-same-document-hash':b=>b.reviewed.citations.amount=['FAKE'],
 'proposal-direct':b=>{for(const k of Object.keys(b))delete b[k];b.type='PolicyProposal';b.sourceDocHash=f.source.sourceDocumentHash;b.amount='50000000';},
 'unsigned-review':b=>delete b.reviewed.reviewSignature,
 'adapter-version-change':b=>b.reviewed.adapterVersion='2',
 'provider-participant-policy-mismatch':b=>b.enrollment.policySpecHash='0x'+'11'.repeat(32),
 'unauthorized-reviewer':b=>b.reviewed.reviewer=f.other.address.toLowerCase(),
 'provider-signature-missing':b=>delete b.provider.signature,
 'participant-signature-missing':b=>delete b.enrollment.signature,
 'wrong-chain':b=>b.provider.chainId=1
};
for(const [id,mutate]of Object.entries(mutations))await run(id,()=>{const b=structuredClone(f.bundle);mutate(b);let code=null;try{f.compiler(b,f.start);}catch(e){code=e.code??e.message;}assert.ok(code,'ATTACK_BECAME_COMPILABLE');return {blocked:true,code};});
await run('stale-policy-hash',()=>{const trust=structuredClone(f.trust);trust.activePolicies[f.source.sourceDocumentHash]='0x'+'aa'.repeat(32);assert.throws(()=>createCompiler(trust)(f.bundle,f.start),/STALE_OR_UNAPPROVED_POLICY/);return {blocked:true};});
await run('expired-by-one-second',()=>{assert.throws(()=>f.compiler(f.bundle,f.c.periods.claimUntil+1),/DEADLINE/);return {blocked:true};});
await run('stage10-F13-kind-only',()=>{
 const old=fs.readFileSync(new URL('../../stage10/protocol-v2/SYNTHETIC_RUNTIME_FIXTURES.jsonl',import.meta.url),'utf8').trim().split('\n').map(JSON.parse).find(x=>x.fixtureId==='F13');
 const attack=structuredClone(old.input);const sourceBefore=attack.sourceBasis;assert.equal(runtimeGate(attack).runtimeExecutable,false);attack.policySpec.kind='NATIVE_FIXED_FOUR';
 const before=runtimeGate(attack);assert.equal(before.runtimeExecutable,true);assert.equal(attack.sourceBasis,sourceBefore);
 assert.throws(()=>f.compiler(attack,f.start));return {originalGateAfterKindOnly:true,newCompilerBlocked:true,sourceBasis:sourceBefore,mutation:'policySpec.kind only',noModelCall:true};
});
await run('partial-public-policy-forced-native',async()=>{
 const row=fs.readFileSync(new URL('../../stage10/protocol-v2/DATASET.jsonl',import.meta.url),'utf8').trim().split('\n').map(JSON.parse).find(x=>x.sourceId==='R02');
 const text=row.input.spans.map(s=>s.text).join('\n');const source=sourcePacket(text,[{id:'P1',start:0,end:text.length,text}]);
 const p=structuredClone(f.payload);p.sourceDocumentHash=source.sourceDocumentHash;p.sourceSpanDigest=source.sourceSpanDigest;p.citations=Object.fromEntries(Object.keys(p.citations).map(k=>[k,['P1']]));p.unsupportedConditions=['공개 R02의 180일 출석·후기 및 공제 계산은 네 서명·50 TEST와 다름'];
 const reviewed=await signReview(p,f.reviewer),trust=structuredClone(f.trust);trust.sources[source.sourceDocumentHash]=source;trust.activePolicies[source.sourceDocumentHash]=reviewed.policySpecHash;
 const b={...structuredClone(f.bundle),reviewed};assert.throws(()=>createCompiler(trust)(b,f.start),/POLICY_NOT_COMPILABLE/);
 b.reviewed.unsupportedConditions=[];assert.throws(()=>createCompiler(trust)(b,f.start),/POLICY_HASH/);return {blocked:true,publicExcerptUsedOnlyForRegression:true,newSemanticEvaluation:false};
});

// Actual local EVM connection, rather than synthetic observation claims.
let chain=null;const onchain=[];
try{
 chain=await localFixture();const now=await chain.now(),payer=chain.wallets[0],reviewer=Wallet.createRandom();
 generatedSecrets.push(...chain.wallets.map(w=>w.privateKey),reviewer.privateKey);
 const next=async()=>getCreateAddress({from:payer.address,nonce:Number(await chain.provider.send('eth_getTransactionCount',[payer.address,'pending']))}).toLowerCase();
 const g=await fixture({wallets:[reviewer,payer,chain.learner,chain.issuer,chain.other],token:chain.token.target,start:now,vault:await next()});
 for(const participant of [chain.learner,chain.other]){
  const b=await g.enrollment(participant,await next());const {plan,vault,anchor}=await deployBound(g.compiler,b,chain.provider,chain.sponsor);
  const acceptance=await enrollBound(g.compiler,b,chain.provider,anchor,chain.sponsor,participant);
  const receipts=await makeReceipts(plan,chain.issuer,now);
  if(participant===chain.other)await chain.setTime(g.c.periods.claimUntil);
  const paid=await claimBound(g.compiler,b,chain.provider,anchor,chain.relayer,acceptance,receipts);
  assert.equal(await chain.token.balanceOf(participant.address),50000000n);assert.equal(await vault.totalReserved(),0n);
  await assert.rejects(()=>claimBound(g.compiler,b,chain.provider,anchor,chain.relayer,acceptance,receipts),/NOT_CLAIMABLE/);
  onchain.push({policyHash:plan.commitment.policySpecHash,recipient:plan.nativeTerms.recipient,vault:plan.nativeTerms.vaultAddress,paid,exactBoundary:participant===chain.other,replayBlocked:true,publicEvidence:{bundle:b,trust:g.trust,plan,anchor,acceptance,receipts}});
 }
 assert.equal(onchain[0].policyHash,onchain[1].policyHash);
 await chain.setTime(now);
 await run('vault-terms-hash-mismatch',async()=>{
  const wrong=await chain.deploy('RefundVault',[chain.token.target,chain.issuer.address,'0x'+'99'.repeat(32),g.c.periods.start,g.c.periods.due,g.c.periods.claimUntil]);
  const receipt=await wrong.deploymentTransaction().wait(),bundle=await g.enrollment(chain.learner,wrong.target);
  const anchor={genesisHash:(await chain.provider.send('eth_getBlockByNumber',['0x0',false])).hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,vaultCodeHash:(await import('ethers')).keccak256(await chain.provider.getCode(wrong.target))};
  await assert.rejects(()=>inspectBound(g.compiler,bundle,chain.provider,anchor),/VAULT_TERMS_HASH/);return {blocked:true,liveEvm:true};
 });
}catch(e){results.push({id:'live-evm-integration',pass:false,error:e.code??e.message});}finally{if(chain)await chain.close();}
const ids=[...expected.normal,...expected.blocked];
assert.equal(new Set(results.map(r=>r.id)).size,results.length);
const covered=ids.every(id=>results.some(r=>r.id===id));
const report={at:new Date().toISOString(),passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,expectedCases:ids.length,covered,results,publicBase:{trust:f.trust,bundle:f.bundle,now:f.start},localEvm:{payments:onchain.length,expectedPayments:2,rows:onchain},dataKind:'SYNTHETIC_ROLE_SIGNATURES_AND_ACTUAL_LOCAL_EVM',realHumanReviews:0,modelCalls:0};
const text=JSON.stringify(report),secretMatches=generatedSecrets.filter(key=>text.toLowerCase().includes(key.slice(2).toLowerCase())).length;
assert.equal(secretMatches,0,'SECRET_IN_RESULT');report.secretAudit={generatedSecretsCompared:generatedSecrets.length,serializedReportsScanned:1,exactMatches:secretMatches,scope:'Exact in-memory generated private-key match against serialized public report before write; no system-wide claim.'};
fs.writeFileSync(out+'/results.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({out,passed:report.passed,failed:report.failed,covered,localPayments:onchain.length}));
if(report.failed||!covered||onchain.length!==2)process.exitCode=1;
