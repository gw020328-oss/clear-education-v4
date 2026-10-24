import test from 'node:test';
import assert from 'node:assert/strict';
import {NESTED_RECORD_SHAPE,readNestedCertificateRecords} from '../../src/hackerrank-evidence/source-records.mjs';
import {validateRecipe} from '../../src/hackerrank-evidence/recipes.mjs';
import {createHackerRankVerifier} from '../../src/hackerrank-evidence/verifier.mjs';
import {canonical,hash} from '../../src/hackerrank-evidence/values.mjs';
import {requestHash,requestMessage} from '../../src/hackerrank-evidence/request.mjs';
import {fixture,actors,NOW,USERNAME,extract,signProof} from './fixture.mjs';

const row=()=>({id:'synthetic-python-rose',type:'test_result',attributes:{username:USERNAME,status:'test_passed',test_unique_id:'synthetic-python-test',
 certificate:{label:'Python',level:'Basic',track_slug:'python_basic'},unusedScore:0.25,certificates:['SYNTHETIC_UNUSED_VALUE']}});
const encode=rows=>JSON.stringify(rows);
// Invented issuer-shaped input and ephemeral test signer. No real recipe is
// derived here: the synthetic HTTP provider captures a whole invented array.
async function nestedFixture(records=[row()],{selection=null}={}){
 const f=await fixture({selectedCertificateId:selection});
 const config=structuredClone(f.config);config.recipe.version='hackerrank-two-proof.2';config.recipe.recordShape=NESTED_RECORD_SHAPE;
 const request={...f.request,recipeHash:hash('RECIPE',config.recipe),trustConfigHash:hash('TRUST',config)};
 const proofs={};
 for(const role of ['account','certificate']){
  const c=structuredClone(f.input.proofs[role].claim),ctx=JSON.parse(c.context);
  ctx.clearRequestHash=requestHash(request);ctx.clearRecipeHash=request.recipeHash;
  if(role==='certificate')ctx.extractedParameters=extract(JSON.parse(c.parameters),JSON.stringify({data:records}));
  c.context=canonical(ctx);proofs[role]=await signProof(c);
 }
 const input={envelope:{request,signature:await actors.participant.signMessage(requestMessage(request))},proofs};
 return {config,request,input,key:f.key,verifier:createHackerRankVerifier({trustConfig:config,commitmentKey:f.key,clock:()=>NOW})};
}
test('nested source maps only same-row fixed fields; unrelated numeric metadata never leaves',()=>{
 const text=encode([row()]).replace('0.25','-1.25e999');
 assert.deepEqual(readNestedCertificateRecords(text),[{username:USERNAME,certificate_id:'synthetic-python-rose',certificate_name:'Python (Basic)',status:'test_passed'}]);
 const other=row();other.id='synthetic-other';other.attributes.certificate={label:'SQL',level:'Basic',track_slug:'sql_basic'};
 assert.equal(readNestedCertificateRecords(encode([other]))[0].certificate_name,'OTHER');
 assert.doesNotMatch(encode(readNestedCertificateRecords(text)),/SYNTHETIC_UNUSED_VALUE|unusedScore|certificates|test_unique_id/);
});
test('whole source grammar, decoded duplicate/unsafe keys and limits precede field projection',()=>{
 const good=encode([row()]);
 const invalid=[good+'{}',good.replace('0.25','01'),good.replace('0.25','1.'),good.replace('0.25','1e+'),
  good.replace('"type":','"id":"duplicate","type":'),good.replace('"type":','"i\\u0064":"duplicate","type":'),
  good.replace('"unusedScore":0.25','"unusedScore":0.25,"unusedScore":1'),
  good.replace('"unusedScore":0.25','"unused":{"__proto__":1}'),
  good.replace('"unusedScore":0.25','"unused":{"constr\\u0075ctor":1}'),
  good.replace('"unusedScore":0.25','"unused":"***"'),
  good.replace('"unusedScore":0.25','"unused":'+ '['.repeat(26)+'null'+']'.repeat(26)),
  good.replace('"unusedScore":0.25','"unused":['+Array(4096).fill('0').join(',')+']'),
  ' '.repeat(65537)+good,JSON.stringify(Array.from({length:33},row))];
 for(const text of invalid)assert.throws(()=>readNestedCertificateRecords(text));
});
test('missing or mistyped required fields and shadow IDs cannot satisfy a nested record',()=>{
 for(const change of [
  r=>{r.id=5;},r=>{r.attributes.username=null;},r=>{r.attributes.status=0.5;},r=>{delete r.attributes.test_unique_id;},
  r=>{delete r.attributes.certificate;},r=>{r.attributes.certificate=[];},r=>{r.attributes.certificate.label=1;},
  r=>{r.attributes.certificate.level=null;},r=>{r.attributes.certificate.track_slug={};},r=>{r.attributes.certificateId='shadow';},
 ]){const r=row();change(r);assert.throws(()=>readNestedCertificateRecords(encode([r])));}
 const noMetadata=row();delete noMetadata.attributes.certificate;noMetadata.attributes.certificates=['Python (Basic)'];
 assert.throws(()=>readNestedCertificateRecords(encode([noMetadata])),/CERTIFICATE_METADATA/);
});
test('label/level/slug conflicts and fields in another row do not repair the selected row',()=>{
 for(const change of [c=>{c.track_slug='sql_basic';},c=>{c.label='SQL';},c=>{c.level='Intermediate';}]){
  const r=row();change(r.attributes.certificate);assert.throws(()=>readNestedCertificateRecords(encode([r])),/CERTIFICATE_METADATA_CONFLICT/);
 }
 const a=row(),b=row();delete a.attributes.certificate;b.id='other';delete b.attributes.username;
 assert.throws(()=>readNestedCertificateRecords(encode([a,b])));
});
test('nested version is explicit and cannot relabel the unchanged synthetic recipe as live',async()=>{
 const f=await nestedFixture();assert.equal(validateRecipe(f.config.recipe),f.config.recipe);
 assert.throws(()=>validateRecipe({...f.config.recipe,version:'hackerrank-two-proof.1'}),/RECIPE_VERSION/);
 assert.throws(()=>createHackerRankVerifier({trustConfig:{...f.config,dataMode:'RECLAIM_SIGNED_RECORD',sourceReview:'AUTHENTICATED_SOURCE_REVIEWED',contextReview:'SIGNED_REQUEST_CONTEXT_CONFIRMED'},commitmentKey:f.key}),/SYNTHETIC_RECIPE_IN_LIVE_MODE/);
});
test('SDK-extracted and signed invented nested record reaches the existing bound candidate',async()=>{
 const f=await nestedFixture(),c=await f.verifier.verify(f.input,f.request);
 assert.equal(c.status,'VERIFIED_CANDIDATE');assert.equal(c.condition,'MET');assert.equal(c.dataMode,'SYNTHETIC_FIXTURE');
 assert.equal(c.sourceVersion,'hackerrank-two-proof.2');assert.equal(c.binding.requestHash,requestHash(f.request));
 assert.equal(c.gates.paymentAllowed,false);assert.equal(c.facts.achievementAt,null);
 assert.equal(f.verifier.recheck(c,f.request).durableConsumptionPerformed,false);
 assert.doesNotMatch(JSON.stringify(c),new RegExp(USERNAME+'|synthetic-python-rose|SYNTHETIC_UNUSED_VALUE'));
});
test('existing account join, duplicate ID, explicit selection and target guards apply to nested rows',async()=>{
 const cases=[
  {rows:()=>{const a=row();a.attributes.username='synthetic_other_account';return [a];},code:'ACCOUNT_JOIN'},
  {rows:()=>[row(),row()],code:'CERTIFICATE_ID'},
  {rows:()=>{const a=row(),b=row();b.id='synthetic-second';return [a,b];},code:'AMBIGUOUS_CERTIFICATE'},
  {rows:()=>[row()],selection:'synthetic-absent',code:'CERTIFICATE_CLASS_OR_SELECTION'},
  {rows:()=>{const a=row();a.attributes.certificate={label:'SQL',level:'Basic',track_slug:'sql_basic'};return [a];},selection:'synthetic-python-rose',code:'CERTIFICATE_CLASS_OR_SELECTION'},
 ];
 for(const example of cases){const f=await nestedFixture(example.rows(),{selection:example.selection??null});assert.equal((await f.verifier.verify(f.input,f.request)).code,example.code);}
 const second=row();second.id='synthetic-second';const f=await nestedFixture([row(),second],{selection:second.id});
 assert.equal((await f.verifier.verify(f.input,f.request)).status,'VERIFIED_CANDIDATE');
});
test('nested status does not bypass decision semantics or signed context and wallet binding',async()=>{
 const failed=row();failed.attributes.status='test_failed';let f=await nestedFixture([failed]);assert.equal((await f.verifier.verify(f.input,f.request)).condition,'NOT_MET');
 const passedOther=row();passedOther.id='synthetic-sql';passedOther.attributes.certificate={label:'SQL',level:'Basic',track_slug:'sql_basic'};
 f=await nestedFixture([failed,passedOther],{selection:failed.id});assert.equal((await f.verifier.verify(f.input,f.request)).condition,'NOT_MET');
 const unknown=row();unknown.attributes.status='test_finished';f=await nestedFixture([unknown]);assert.equal((await f.verifier.verify(f.input,f.request)).code,'UNKNOWN_ISSUER_STATUS');
 f=await nestedFixture();const changed=structuredClone(f.input);const c=JSON.parse(changed.proofs.certificate.claim.context);c.extractedParameters.records=encode([failed]);changed.proofs.certificate.claim.context=canonical(c);
 assert.equal((await f.verifier.verify(changed,f.request)).code,'CLAIM_IDENTIFIER');
 const wrongWallet={...f.request,participantWallet:actors.other.address.toLowerCase()};assert.notEqual((await f.verifier.verify(f.input,wrongWallet)).status,'VERIFIED_CANDIDATE');
});
