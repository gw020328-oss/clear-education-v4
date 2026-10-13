import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {scoreHtml,scoreRow} from '../../tests/ybm-collector/source-fixture.mjs';
import {quiet} from '../../src/ybm-collector/client.mjs';
import {POLICY,contiguousPolicy,inspectRecord,evaluateAtAttestor,assertStockClaimUsableForDirectClaim,finaliseSingleSharePinned,scopedOprfInput,createAttestorEvaluator} from './record-policy.mjs';
const require=createRequire(new URL('../../src/ybm-collector/package.json',import.meta.url));
process.env.LOG_LEVEL='silent';
const sdk=await import(require.resolve('@reclaimprotocol/attestor-core'));
const http=sdk.providers.http,modern=sdk.proto.AttestorVersion.ATTESTOR_VERSION_3_2_0,legacy=sdk.proto.AttestorVersion.ATTESTOR_VERSION_3_1_0;
const source=rows=>Buffer.from(scoreHtml(rows));
const provenance={sourceUrl:POLICY.source,sourceMethod:POLICY.method,transformedRanges:[]};
function receipt(rows,{mask,version=modern,params=contiguousPolicy()}={}){
 const body=source(rows),headers=Buffer.from(`HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${body.length}\r\n\r\n`);
 const response=Buffer.concat([headers,body]),redacted=Buffer.from(response);
 if(mask)mask(redacted,headers.length,response);
 else for(const r of http.getResponseRedactions({response,params,logger:quiet,ctx:{version:modern}}))redacted.fill('*',r.fromIndex,r.toIndex);
 const req=http.createRequest({cookieStr:'SYNTHETIC_COOKIE'},structuredClone(params),quiet),request=Buffer.from(req.data);
 for(const r of req.redactions)request.fill('*',r.fromIndex,r.toIndex);
 return http.assertValidProviderReceipt({clientVersion:version,receipt:[{sender:'client',message:request},{sender:'server',message:redacted}],params,logger:quiet,ctx:{version}});
}
test('contiguous SDK predicate accepts eligible synthetic rows and extracts no private values',()=>{
 for(let n=10;n<=990;n+=5){
   if(n<800)assert.throws(()=>receipt([{score:String(n)}]));
   else assert.deepEqual(receipt([{score:String(n)}]).extractedParameters,{});
 }
});
test('month boundaries and invalid dates fail closed',()=>{
 for(const date of ['2026.09.01','2026.09.30'])receipt([{date}]);
 for(const date of ['2026.08.31','2026.10.01','2026.09.00','2026.09.31'])assert.throws(()=>receipt([{date}]));
});
const mixed=[{score:'795'},{date:'2026.08.20',number:'654321',score:'850'}];
test('original cross-row byte disclosure rejected at SDK receipt boundary',()=>{
 assert.throws(()=>receipt(mixed,{mask:(out,offset,original)=>{
   out.fill('*',offset);let cursor=offset;
   for(const text of ['TOEIC','2026.09.20(일)','123456','Total 850 (']){
     const at=original.indexOf(text,cursor);assert(at>=0);original.copy(out,at,at+Buffer.byteLength(text));cursor=at+Buffer.byteLength(text);
   }
 }}));
});
test('all 256 critical-cell reveal combinations of two ineligible rows rejected',()=>{
 for(let bits=0;bits<256;bits++)assert.throws(()=>receipt(mixed,{mask:(out,offset,original)=>{
   // All original HTML markup remains visible; attacker chooses 8 cell texts.
   let cursor=offset;
   const strings=['TOEIC','2026.09.20(일)','123456','Total 795 (','TOEIC','2026.08.20(일)','654321','Total 850 ('];
   strings.forEach((text,i)=>{const at=original.indexOf(text,cursor);assert(at>=0);if(!(bits&(1<<i)))out.fill('*',at,at+Buffer.byteLength(text));cursor=at+Buffer.byteLength(text);});
 }}));
});
test('hiding arbitrary cross-row interval cannot splice first date into second score',()=>{
 const raw=source(mixed),start=raw.indexOf('Total 795'),end=raw.indexOf('Total 850');
 for(let a=start-20;a<=start;a++)for(let b=end;b<=end+6;b++)assert.throws(()=>receipt(mixed,{mask:(out,offset)=>out.fill('*',offset+a,offset+b)}));
});
test('legacy star-stripping verifier rejected even on honest eligible receipt',()=>assert.throws(()=>receipt([{}],{version:legacy})));
test('loss of marker guard permits legacy splice: guard is necessary',()=>{
 const params=contiguousPolicy();params.responseMatches.pop();
 receipt(mixed,{version:legacy,params,mask:(out,offset,original)=>{
   const a=original.indexOf('Total 795',offset),b=original.indexOf('Total 850',a);out.fill('*',a,b);
 }});
});
test('canonical identity ignores rendering/score/reissuance but preserves source digits',()=>{
 const a=inspectRecord(source([{}])).identity;
 const b=inspectRecord(Buffer.from(scoreHtml([{score:'990'}]).replace(/<\/td><td>/g,'</td> \n<td>'))).identity;
 assert.deepEqual(a,b);
 assert.notDeepEqual(a,inspectRecord(source([{number:'0123456'}])).identity);
 assert.notDeepEqual(a,inspectRecord(source([{date:'2026.09.21'}])).identity);
});
test('attestor record inspection rejects cross-row input and transformed record bytes',()=>{
 assert.throws(()=>inspectRecord(source(mixed)));
 const body=source([{}]),r=inspectRecord(body).range;
 assert.throws(()=>inspectRecord(body,{transformedRanges:[{start:r.start+1,end:r.start+2}]}),/TRANSFORMED_RECORD/);
 assert.throws(()=>inspectRecord(body,{transformedRanges:[{start:-1,end:2}]}),/PROVENANCE_RANGE/);
});
test('complete-body inspection rejects row-looking text in comments and scripts',()=>{
 for(const wrapper of [s=>`<html><!--${s}--></html>`,s=>`<html><script>${s}</script></html>`]){
  assert.throws(()=>inspectRecord(Buffer.from(wrapper(scoreRow().replace('<!-- SYNTHETIC_PRIVATE_COMMENT -->','')))));
 }
});
const scope='a'.repeat(64),key='b'.repeat(64);
test('attestor extension rejects short OPRF output and key drift',async()=>{
 for(const result of [{output:new Uint8Array(6).fill(1),keyFingerprint:key},{output:new Uint8Array(32).fill(1),keyFingerprint:'c'.repeat(64)}]){
  await assert.rejects(evaluateAtAttestor({...provenance,body:source([{}]),businessScope:scope,configuredKey:key,evaluateOprf:async()=>result}));
 }
});
test('untrusted stock claim/context cannot enable production direct claim',()=>{
 for(const value of [{qualified:true,nullifier:'d'.repeat(64)},{kind:'EXPERIMENTAL_ATTESTOR_FACT_V1',official:true}])assert.throws(()=>assertStockClaimUsableForDirectClaim(value),/BLOCKED/);
});
test('explicit key pin rejects arbitrary shares and unimplemented multi-share mode',async()=>{
 const key=Buffer.alloc(32,1),operator={finaliseOPRF(){throw Error('MUST_NOT_CALL');}};
 for(const responses of [[],[{publicKeyShare:Buffer.alloc(32,2)}],[{publicKeyShare:key},{publicKeyShare:key}]])await assert.rejects(finaliseSingleSharePinned(operator,key,{},responses),/OPRF_SHARE_PIN/);
});
test('full business scope is bound in private OPRF input',()=>{
 const identity=inspectRecord(source([{}])).identity;
 const a=scopedOprfInput(identity,'a'.repeat(64)),b=scopedOprfInput(identity,'a'.repeat(63)+'b');
 assert.equal(a.length,32);assert.notDeepEqual(a,b);
 assert.throws(()=>scopedOprfInput(identity,'caller-chosen-label'),/BUSINESS_SCOPE/);
});
test('claimant-controlled salt or supplied nullifier is not an evaluator input',async()=>{
 let seen;
 const result=await evaluateAtAttestor({...provenance,body:source([{}]),businessScope:scope,configuredKey:key,nullifier:'e'.repeat(64),owner:'wallet-2',application:'app-2',evaluateOprf:async(input,domain)=>{
   seen={input:input.toString(),domain};return {output:new Uint8Array(32).fill(7),keyFingerprint:key};
 }});
 assert(!seen.input.includes('wallet')&&!seen.input.includes('app'));
 assert.equal(result.nullifier,'07'.repeat(32));
 for(const text of ['123456','2026.09.20','850','SYNTHETIC_PRIVATE'])assert(!JSON.stringify(result).includes(text));
});
test('deployment configuration overrides claimant scope/key/operator',async()=>{
 const evaluator=createAttestorEvaluator({businessScope:scope,configuredKey:key,evaluateOprf:async()=>({output:Buffer.alloc(32,7),keyFingerprint:key})});
 const result=await evaluator({...provenance,body:source([{}]),businessScope:'e'.repeat(64),configuredKey:'e'.repeat(64),evaluateOprf:()=>{throw Error('CLIENT_OPERATOR');}});
 assert.equal(result.businessScope,scope);assert.equal(result.keyFingerprint,key);
 for(const patch of [{sourceUrl:'https://example.invalid/'},{sourceMethod:'POST'},{transformedRanges:undefined}])await assert.rejects(evaluator({...provenance,body:source([{}]),...patch}),/AUTHENTICATED_SOURCE_METADATA_REQUIRED/);
});
test('native field-element leading zeros are encoded unambiguously',async()=>{
 const key=Buffer.alloc(32,1),operator={finaliseOPRF:async()=>Buffer.alloc(31,7)};
 const output=await finaliseSingleSharePinned(operator,key,{},[{publicKeyShare:key}]);
 assert.equal(output.length,32);assert.equal(output[0],0);assert.equal(output[1],7);
});
