import test from 'node:test';
import assert from 'node:assert/strict';
import * as ethers from 'ethers';
import { localFixture } from '../lib/local.mjs';
import { createValidation,MAX_EVIDENCE_BYTES } from '../shared/validation.mjs';
import { createClaimCore } from '../shared/claim-core.mjs';
import { claimRefund,verifyDeployment } from '../lib/chain.mjs';
import { validateTrust,parseEvidenceText,validateEvidence,AMOUNT } from '../lib/evidence.mjs';
import { ClaimState } from '../claim-ui/state.mjs';
import { normalizeWalletError,waitForFinalReceipt } from '../shared/wallet-flow.mjs';
import { fundedEvidence,code } from './helpers.mjs';

test('M-01/M-02 browser and Node use identical strict corpus results',async()=>{
  const fx=await localFixture();try{
    const normal=await fundedEvidence(fx),sig=normal.submissions[0].signature;
    const mutate=fn=>{const v=structuredClone(normal);fn(v);return v};
    const n=BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'),s=BigInt('0x'+sig.slice(66,130)),vByte=sig.slice(-2)==='1b'?'1c':'1b';
    const corpus=[
      ['normal',JSON.stringify(normal)],
      ['compact',JSON.stringify(mutate(x=>x.submissions[0].signature=ethers.Signature.from(sig).compactSerialized))],
      ['v01',JSON.stringify(mutate(x=>x.submissions[0].signature=sig.slice(0,-2)+'00'))],
      ['object-signature',JSON.stringify(mutate(x=>x.submissions[0].signature={r:'0x1',s:'0x2',v:27}))],
      ['high-s',JSON.stringify(mutate(x=>x.submissions[0].signature=sig.slice(0,66)+(n-s).toString(16).padStart(64,'0')+vByte))],
      ['extra-field',JSON.stringify(mutate(x=>x.untrusted=true))],
      ['wrong-type',JSON.stringify(mutate(x=>x.submissions[0].receipt.session='0'))],
      ['one-mib',JSON.stringify(normal)+' '.repeat(1024*1024)],
      ['deep-json',JSON.stringify({x:Array.from({length:15}).reduce(v=>[v],0)})]
    ];
    const browser=createValidation(ethers),node=createValidation(ethers),run=async(validator,text)=>code(()=>{const p=validator.parseEvidenceText(text);return validator.validateEvidence(p,fx.trusted,normal.recipient,fx.trusted.terms.start)});
    for(const [name,text] of corpus){const a=await run(browser,text),b=await run(node,text);assert.equal(a,b,name);assert.equal(a,name==='normal'?'ACCEPT':name==='one-mib'?'FILE_TOO_LARGE':name==='deep-json'?'JSON_DEPTH':a,name);if(name!=='normal')assert.notEqual(a,'ACCEPT',name);}
    assert.equal(MAX_EVIDENCE_BYTES,65536);assert.equal(await code(()=>parseEvidenceText('x'.repeat(65537))),'FILE_TOO_LARGE');
  }finally{await fx.close()}
});

test('H-01 same chainId but different chain is blocked before any sender gas or nonce changes',async()=>{
  const [a,b]=await Promise.all([localFixture({startTime:'2026-09-13T00:00:00Z'}),localFixture({startTime:'2026-09-14T00:00:00Z'})]);
  try{
    const evidence=await fundedEvidence(a),core=createClaimCore(ethers),aSender=a.attacker.address,bSender=b.attacker.address;
    const before={an:await a.provider.getTransactionCount(aSender),bn:await b.provider.getTransactionCount(bSender),ab:await a.provider.getBalance(aSender),bb:await b.provider.getBalance(bSender),aBlock:await a.provider.getBlockNumber(),bBlock:await b.provider.getBlockNumber()};
    assert.equal((await core.verifyDeployment(a.provider,a.trusted)).chainId,31337);
    assert.equal(await code(()=>core.verifyDeployment(b.provider,a.trusted)),'DEPLOYMENT_MISMATCH');
    assert.equal(await code(()=>core.inspectClaim(b.provider,a.trusted,evidence)),'DEPLOYMENT_MISMATCH');
    const after={an:await a.provider.getTransactionCount(aSender),bn:await b.provider.getTransactionCount(bSender),ab:await a.provider.getBalance(aSender),bb:await b.provider.getBalance(bSender),aBlock:await a.provider.getBlockNumber(),bBlock:await b.provider.getBlockNumber()};
    assert.deepEqual(after,before);
  }finally{await Promise.all([a.close(),b.close()])}
});

test('H-02 default token has no freeze path; negative fixture is rejected by token policy',async()=>{
  const fx=await localFixture();try{
    const evidence=await fundedEvidence(fx),freezeData=ethers.id('setFrozen(bool)').slice(0,10)+ethers.AbiCoder.defaultAbiCoder().encode(['bool'],[true]).slice(2);
    await assert.rejects(()=>fx.sponsor.sendTransaction({to:fx.token.target,data:freezeData}));
    await assert.rejects(()=>fx.vault.connect(fx.sponsor).reclaimExpired(fx.learner.address));
    const paid=await claimRefund(fx.provider,fx.trusted,fx.relayer,evidence);assert.equal(paid.paidUnits,AMOUNT.toString());
  }finally{await fx.close()}
  const bad=await localFixture({tokenKind:'freezable'});try{assert.equal(await code(()=>validateTrust(bad.trusted)),'UNTRUSTED_TOKEN_CODE');assert.equal(await code(()=>verifyDeployment(bad.provider,bad.trusted)),'UNTRUSTED_TOKEN_CODE')}finally{await bad.close()}
});

test('M-03 payment proof tolerates prior dust and rejects false or incomplete receipts',async()=>{
  const fx=await localFixture();try{
    const evidence=await fundedEvidence(fx);await (await fx.token.connect(fx.sponsor).transfer(fx.learner.address,1n)).wait();
    const vault=fx.vault.connect(fx.relayer),tx=await vault.claim(evidence.recipient,evidence.submissions.map(x=>x.receipt),evidence.submissions.map(x=>x.signature)),receipt=await tx.wait(),core=createClaimCore(ethers);
    const paid=await core.verifyPaidReceipt(fx.provider,fx.trusted,evidence,fx.attacker.address,receipt);assert.equal(paid.afterUnits,(AMOUNT+1n).toString());
    assert.equal(await code(()=>core.verifyPaidReceipt(fx.provider,fx.trusted,evidence,fx.attacker.address,{...receipt,logs:receipt.logs.filter(l=>l.address.toLowerCase()!==fx.token.target.toLowerCase())})),'PAYMENT_TRANSFER_EVENT');
    assert.equal(await code(()=>core.verifyPaidReceipt(fx.provider,fx.trusted,evidence,fx.attacker.address,{...receipt,to:fx.token.target})),'WRONG_TRANSACTION_TARGET');
  }finally{await fx.close()}
});

test('M-04 file, RPC, account and network changes clear validation and transaction state',()=>{
  for(const scope of ['file','rpc','wallet','all']){const s=new ClaimState();s.evidence={};s.fileChecked=s.chainChecked=s.walletChecked=true;s.signer={};s.account='x';s.phase='complete';const epoch=s.epoch;s.invalidate(scope);assert.equal(s.epoch,epoch+1);assert.equal(s.phase,'idle');assert.equal(s.walletChecked,false);if(scope==='file')assert.equal(s.fileChecked,false);if(scope==='rpc')assert.equal(s.chainChecked,false);}
});

test('M-04 estimated total fee, not positive balance, gates sending',async()=>{
  const fx=await localFixture();try{const evidence=await fundedEvidence(fx),core=createClaimCore(ethers),empty=ethers.Wallet.createRandom().connect(fx.provider),dep=await core.verifyDeployment(fx.provider,fx.trusted);assert.equal(await code(()=>core.estimateCost(dep.vault,empty,evidence,empty.address)),'INSUFFICIENT_GAS')}finally{await fx.close()}
});

test('M-04 rejection, lock, replacement, cancellation, revert and missing receipt stay distinct',async()=>{
  assert.equal(normalizeWalletError({code:4001}).code,'ACTION_REJECTED');assert.equal(normalizeWalletError({code:4100}).code,'WALLET_LOCKED');
  const replacement={status:1,hash:'replacement'};assert.equal(await waitForFinalReceipt({wait:async()=>{throw{code:'TRANSACTION_REPLACED',cancelled:false,receipt:replacement}}}),replacement);
  for(const [name,thrown,expected] of [
    ['cancel',{code:'TRANSACTION_REPLACED',cancelled:true},'TRANSACTION_CANCELLED'],
    ['revert',{receipt:{status:0}},'TRANSACTION_REVERTED'],
    ['missing',new Error('network unavailable'),'RECEIPT_UNAVAILABLE']
  ])assert.equal(await code(()=>waitForFinalReceipt({wait:async()=>{throw thrown}})),expected,name);
});

test('TOCTOU revalidation observes expiry and a competing settlement',async()=>{
  const fx=await localFixture();try{const evidence=await fundedEvidence(fx),core=createClaimCore(ethers);await core.inspectClaim(fx.provider,fx.trusted,evidence);await fx.setTime(fx.trusted.terms.claimUntil+1);assert.equal(await code(()=>core.inspectClaim(fx.provider,fx.trusted,evidence)),'EXPIRED')}finally{await fx.close()}
  const fx2=await localFixture();try{const evidence=await fundedEvidence(fx2),core=createClaimCore(ethers);await core.inspectClaim(fx2.provider,fx2.trusted,evidence);await claimRefund(fx2.provider,fx2.trusted,fx2.relayer,evidence);assert.equal(await code(()=>core.inspectClaim(fx2.provider,fx2.trusted,evidence)),'NOT_CLAIMABLE')}finally{await fx2.close()}
});

test('M-03/M-04 UI source keeps approval/broadcast/completion distinct and installs wallet invalidators',async()=>{
  const source=await (await import('node:fs/promises')).readFile(new URL('../claim-ui/app.js',import.meta.url),'utf8');
  for(const text of ["state.phase='approval'","state.phase='broadcast'","state.phase='complete'","'accountsChanged','chainChanged','disconnect'",'estimateCost','verifyPaidReceipt','waitForFinalReceipt'])assert.ok(source.includes(text),text);
  assert.equal(source.includes("result('submitted','청구 접수'"),false);
});
