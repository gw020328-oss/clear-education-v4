import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {bindingTypes,createDiagnosticAuthority,createBoundCollection,verifyInstruction,prepareLocalDiagnostic} from '../../src/ybm-collector/binding.mjs';
import {digest} from '../../src/ybm-collector/values.mjs';
import {createExtraction} from '../../src/ybm-collector/extraction.mjs';
import {registrationHtml,scoreHtml} from './source-fixture.mjs';
const require=createRequire(new URL('../../src/ybm-collector/package.json',import.meta.url));
const {Wallet}=await import(require.resolve('ethers'));
async function setup(t,options={}){
 let time=1000;const now=()=>time,recipient=Wallet.createRandom(),owner=Wallet.createRandom(),signer=Wallet.createRandom();
 const authority=createDiagnosticAuthority({signer,now,...options});t.after(()=>authority.close());
 const app={applicationId:digest({app:'synthetic'}),recipient:recipient.address,policyHash:digest({policy:'synthetic'})};authority.registerApplication(app);
 const record=authority.issue({applicationId:app.applicationId,ownerPublicKey:owner.signingKey.publicKey});
 const walletSignature=await recipient.signTypedData(record.domain,bindingTypes,record.binding);
 const authorize=()=>authority.authorize({sessionId:record.binding.proofSessionId,walletSignature});
 const params={authority,expectedRecord:record,ownerPublicKey:owner.signingKey.publicKey,now};
 return {authority,app,record,recipient,owner,walletSignature,authorize,params,setTime:n=>time=n};
}
test('fresh owner, recipient authorization and different role/index requests bind to one application',async t=>{
 const h=await setup(t),envelope=await h.authorize(),c=createBoundCollection({...h.params,envelope});
 assert.throws(()=>c.request('score'));c.start();
 const a=c.request('registration'),b=c.request('score',1),d=c.request('score',0);
 assert.equal(a.ownerAddress,h.owner.address);assert.equal(a.context.clearBindingHash,b.context.clearBindingHash);
 assert.notEqual(a.context.clearSourceRequestId,b.context.clearSourceRequestId);assert.notEqual(d.context.clearSourceRequestId,b.context.clearSourceRequestId);
 c.finish();assert.throws(()=>c.request('score'));assert.throws(()=>createBoundCollection({...h.params,envelope}).start());
});
for(const field of ['applicationId','learner','policyHash','runtimeConfigHash','proofSessionId','requestNonce','ownerPublicKey','expiresAt'])test('wallet signature refuses modified '+field,async t=>{
 const h=await setup(t),binding={...h.record.binding};binding[field]=field==='learner'?Wallet.createRandom().address:field==='ownerPublicKey'?Wallet.createRandom().signingKey.publicKey:field==='expiresAt'?binding.expiresAt+1:digest({altered:field});
 const walletSignature=await h.recipient.signTypedData(h.record.domain,bindingTypes,binding);
 await assert.rejects(h.authority.authorize({sessionId:h.record.binding.proofSessionId,walletSignature}),/WALLET_SIGNATURE/);
});
test('envelope requires separately trusted record, policy, runtime, owner and authority signature',async t=>{
 const h=await setup(t),e=await h.authorize();const opts={trustedConfig:h.authority.trustedConfig(),expectedRecord:h.record,ownerPublicKey:h.owner.signingKey.publicKey,now:1000};
 for(const mutate of [v=>v.record.fixedRecipient=Wallet.createRandom().address,v=>v.record.sourceRequestIds.score[0]=digest('changed'),v=>v.instruction.recordHash=digest('changed'),v=>v.authoritySignature=v.walletSignature,v=>v.walletSignature=v.authoritySignature,v=>v.extra=true]){const copy=structuredClone(e);mutate(copy);assert.throws(()=>verifyInstruction(copy,opts));}
 assert.throws(()=>verifyInstruction(e,{...opts,ownerPublicKey:Wallet.createRandom().signingKey.publicKey}));
 assert.throws(()=>verifyInstruction(e,{...opts,trustedConfig:{...opts.trustedConfig,runtimeConfigHash:digest('other')}}));
 assert.throws(()=>verifyInstruction(e,{...opts,expectedRecord:{...h.record,scope:'OTHER'}}));
});
test('expired sessions and backwards clock fail before start and between sources',async t=>{
 const h=await setup(t),e=await h.authorize(),c=createBoundCollection({...h.params,envelope:e});c.start();h.setTime(2800);assert.throws(()=>c.request('score'),/SESSION_EXPIRED/);
 assert.throws(()=>createBoundCollection({...h.params,envelope:e}),/SESSION_EXPIRED/);h.setTime(999);assert.throws(()=>c.request('score'),/SESSION_EXPIRED/);
});
test('duplicate applications, busy applications and owner reuse are refused',async t=>{
 const h=await setup(t);assert.throws(()=>h.authority.registerApplication(h.app));assert.throws(()=>h.authority.issue({applicationId:h.app.applicationId,ownerPublicKey:Wallet.createRandom().signingKey.publicKey}),/APPLICATION_BUSY/);
 h.authority.cancel(h.record.binding.proofSessionId);assert.throws(()=>h.authority.issue({applicationId:h.app.applicationId,ownerPublicKey:h.owner.signingKey.publicKey}),/OWNER_REUSE/);
 const next=h.authority.issue({applicationId:h.app.applicationId,ownerPublicKey:Wallet.createRandom().signingKey.publicKey});assert.notEqual(next.binding.proofSessionId,h.record.binding.proofSessionId);
});
test('cancel during asynchronous authority signing cannot revive authorization',async t=>{
 const signer=Wallet.createRandom();let release;const delayed={address:signer.address,signTypedData:async(...args)=>{await new Promise(r=>release=r);return signer.signTypedData(...args);}};
 const h=await setup(t,{signer:delayed});const pending=h.authorize();h.authority.cancel(h.record.binding.proofSessionId);release();await assert.rejects(pending,/AUTHORIZATION_INTERRUPTED/);
});
test('two concurrent authorizations cannot consume the same session',async t=>{
 const h=await setup(t);const results=await Promise.allSettled([h.authorize(),h.authorize()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('two applications cannot exchange signed collection envelopes',async t=>{
 const h=await setup(t),e=await h.authorize();h.authority.registerApplication({...h.app,applicationId:digest('second')});
 const other=h.authority.issue({applicationId:digest('second'),ownerPublicKey:Wallet.createRandom().signingKey.publicKey});
 assert.throws(()=>createBoundCollection({...h.params,envelope:e,expectedRecord:other}));
});
for(const reverse of [false,true])test('bound extraction completes in either order, wipes supplied bodies and returns no exam fields '+reverse,async()=>{
 const d=await prepareLocalDiagnostic();try{d.collection.start();const x=createExtraction(d.collection),inputs=[['registration',Buffer.from(registrationHtml())],['score',Buffer.from(scoreHtml())]];if(reverse)inputs.reverse();
 assert.equal(x.accept(...inputs[0]).complete,false);const result=x.accept(...inputs[1]);assert.equal(result.complete,true);assert.equal(result.proofVerified,false);assert.equal(result.paymentAllowed,false);
 assert.ok(inputs.every(([,bytes])=>bytes.every(b=>b===0)));for(const value of ['123456','850','2026-09-20'])assert.ok(!JSON.stringify(result).includes(value));assert.throws(()=>d.collection.request('score'));}finally{d.close();}
});
test('mismatched or malformed extraction cancels the application and wipes its input',async()=>{
 const d=await prepareLocalDiagnostic();try{d.collection.start();const x=createExtraction(d.collection);x.accept('registration',Buffer.from(registrationHtml()));const bad=Buffer.from(scoreHtml([{number:'999999'}]));assert.throws(()=>x.accept('score',bad),/EXAM_JOIN/);assert.ok(bad.every(b=>b===0));assert.throws(()=>d.collection.assertActive());}finally{d.close();}
});
