import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet,core} from './proof-fixture.mjs';
import {canonical} from '../../src/ybm-collector/values.mjs';
import {historyParams,historyPolicyHash} from '../../src/ybm-collector/history-policy.mjs';
import {verifyHistory} from '../../src/ybm-collector/history-verifier.mjs';
import {verifyIndependently} from '../../src/ybm-collector/history-independent.mjs';
import {scoreHtml} from './source-fixture.mjs';
async function fixture(){const attestor=Wallet.createRandom(),owner=Wallet.createRandom(),now=Math.floor(Date.now()/1000);
 const expected={owner:owner.address,createdAt:now,nonce:'SYNTHETIC_NONCE'};
 const claim={provider:'http',parameters:canonical(historyParams()),owner:owner.address.toLowerCase(),timestampS:now,epoch:1,context:canonical({purpose:'YBM_HISTORY_SPIKE_NO_PAYMENT',historyNonce:expected.nonce,historyPolicyHash,extractedParameters:{history_html:scoreHtml([{number:'999999',score:'990'},{}]).match(/<table[\s\S]*?<\/table>/)[0]}}),identifier:''};
 const proof={claim,attestor:attestor.address,signature:''};const sign=async()=>{claim.identifier=core.getIdentifierFromClaimInfo(claim);proof.signature=await attestor.signMessage(core.createSignDataForClaim(claim));};await sign();return {input:{proof,expected,trust:[attestor.address]},sign};}
test('independent offline verifier accepts a signed synthetic whole table without leaking rows',async()=>{const f=await fixture(),r=await verifyIndependently(f.input);assert.equal(r.proofVerified,true);assert.equal(r.parsedRowCount,2);assert.equal(r.fullHistoryProven,false);for(const v of ['999999','850','990'])assert.ok(!JSON.stringify(r).includes(v));});
test('deleting a row from the signed payload invalidates proof',async()=>{const f=await fixture(),c=f.input.proof.claim,ctx=JSON.parse(c.context);ctx.extractedParameters.history_html=scoreHtml();c.context=canonical(ctx);await assert.rejects(verifyHistory(f.input));});
test('even validly signed row-selective recipe does not match pinned whole-table recipe',async()=>{const f=await fixture();f.input.proof.claim.parameters=canonical({...historyParams(),responseRedactions:[{xPath:'//tr[1]'}]});await f.sign();await assert.rejects(verifyHistory(f.input),/SOURCE_POLICY/);});
test('wrong owner, stale timestamp and changed nonce fail despite valid synthetic attestor signature',async()=>{for(const kind of ['owner','time','nonce']){const f=await fixture();if(kind==='owner')f.input.proof.claim.owner=Wallet.createRandom().address;if(kind==='time')f.input.proof.claim.timestampS-=1900;if(kind==='nonce'){const ctx=JSON.parse(f.input.proof.claim.context);ctx.historyNonce='WRONG';f.input.proof.claim.context=canonical(ctx);}await f.sign();await assert.rejects(verifyHistory(f.input));}});
