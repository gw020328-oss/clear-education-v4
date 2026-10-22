import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectLayoutJson,scanLayoutJson,SURVEY_LIMITS} from '../../src/hackerrank-evidence/layout-json.mjs';
import {inspectSourceLayout} from '../../src/hackerrank-evidence/layout-review.mjs';
import {strictJson} from '../../src/hackerrank-evidence/values.mjs';
const marker='SYNTHETIC_PRIVATE_SENTINEL';
const script=(text,id='__NEXT_DATA__')=>`<script id="${id}" type="application/json">${text}</script>`;
const account=value=>inspectSourceLayout('account',Buffer.from(script(typeof value==='string'?value:JSON.stringify(value))));
const certificate=value=>inspectSourceLayout('certificate',Buffer.from(JSON.stringify(value)));
const nestedRow=()=>({hacker:{username:marker},certificate:{id:marker,name:marker},status:marker});
const noPrivate=result=>assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_PRIVATE|private-key-name|private-script-id/);
function deep(depth){let value=0;for(let i=0;i<depth;i++)value={data:value};return value;}

test('first size failure and distinct second-pass depth/node/duplicate/unsafe/syntax failures are reported',()=>{
 const pad='"private-key-name":"'+marker+'x'.repeat(65536)+'",';
 const cases=[
  ['{'+pad+'"data":'+JSON.stringify(deep(50))+'}','DEPTH_LIMIT'],
  ['{'+pad+'"data":['+'0,'.repeat(32768)+'0]}','NODE_LIMIT'],
  ['{'+pad+'"user":{},"user":{}}','DUPLICATE_KEY'],
  ['{'+pad+'"\\u005f_proto__":{}}','UNSAFE_KEY'],
  ['{'+pad+'"data":}','JSON_SYNTAX'],
 ];
 for(const [text,secondaryStatus]of cases){
  const result=account(text),diagnostic=result.scriptDiagnostics[0];
  assert.equal(diagnostic.primaryStatus,'SIZE_LIMIT');assert.equal(diagnostic.secondaryStatus,secondaryStatus);
  assert.equal(result.structureParsed,false);assert.equal(result.schemaOutcome,'PARSER_BLOCKED');
  assert.deepEqual(result.candidateJsonPaths,[]);noPrivate(result);
 }
 const oversized=inspectLayoutJson(' '.repeat(1048577),1048576);
 assert.equal(oversized.diagnostic.primaryStatus,'SIZE_LIMIT');assert.equal(oversized.diagnostic.secondaryStatus,'SIZE_LIMIT');
});
test('bounded survey can inspect >64KiB script while preserving strict size rejection and no values',()=>{
 const result=account({private:marker+'x'.repeat(65536),props:{pageProps:{auth:{currentUser:{username:marker}}}}});
 assert.deepEqual(result.jsonScriptStatuses,['STRICT_SIZE_LIMIT']);assert.equal(result.structureParsed,true);
 assert.equal(result.scriptDiagnostics[0].primaryStatus,'SIZE_LIMIT');assert.equal(result.scriptDiagnostics[0].secondaryStatus,'ACCEPTED');
 assert.deepEqual(result.candidateJsonPaths,['props.pageProps.auth.currentUser.username']);
 assert.equal(result.scriptDiagnostics[0].idKind,'NEXT_DATA');assert.equal(result.authenticatedAccountControlProven,false);noPrivate(result);
});
test('fraction/exponent/unsafe integer and JSON grammar are distinct; second parser keeps only type',()=>{
 for(const [number,code,form]of [['0.5','NUMBER_FRACTION','FRACTION'],['1e2','NUMBER_EXPONENT','EXPONENT'],['9007199254740992','NUMBER_UNSAFE_INTEGER','UNSAFE_INTEGER']]){
  const text='{"status":'+number+',"username":"'+marker+'"}',result=inspectLayoutJson(text,65536);
  assert.equal(result.strictAccepted,false);assert.equal(result.diagnostic.primaryStatus,code);
  assert.equal(result.diagnostic.secondaryStatus,'ACCEPTED');assert.deepEqual(result.diagnostic.numericForms,[form]);
  assert.equal(result.shape.entries[0].node.type,'number');noPrivate(result);
 }
 for(const text of ['{"data":01}','{"data":NaN}','{"data":1.}','{"data":+1}','{"data":"unterminated}']){
  const result=inspectLayoutJson(text,65536);
  assert.equal(result.diagnostic.secondaryStatus,'JSON_SYNTAX');assert.equal(result.shape,undefined);
 }
 const escaped=inspectLayoutJson('{"username":"'+marker+' \\"1e2\\" \\\\ 0.5"}',65536);
 assert.equal(escaped.diagnostic.primaryStatus,'ACCEPTED');assert.deepEqual(escaped.diagnostic.numericForms,[]);noPrivate(escaped);
});
test('diagnostic classification agrees with actual signed parser at integer/size/depth/node boundaries',()=>{
 const corpus=['null','true','[]','{}','-1','1.5','1e0','9007199254740992','{"a":1,"\\u0061":2}','{"prototype":0}',
  JSON.stringify(deep(24)),JSON.stringify(deep(25)),JSON.stringify(Array(4095).fill(0)),JSON.stringify(Array(4096).fill(0)),
  '"'+ 'x'.repeat(65534)+'"','"'+ 'x'.repeat(65535)+'"', '{"x":"\\u0000"}','{"x":false}'];
 for(const text of corpus){
  let accepted=true;try{strictJson(text);}catch{accepted=false;}
  const inspected=inspectLayoutJson(text,1048576);
  assert.equal(inspected.strictAccepted,accepted);assert.notEqual(inspected.diagnostic.primaryStatus,'DIAGNOSTIC_MISMATCH');
  assert.equal(scanLayoutJson(text).status==='ACCEPTED',accepted);
 }
 assert.equal(scanLayoutJson(JSON.stringify(deep(24))).status,'ACCEPTED');
 assert.equal(scanLayoutJson(JSON.stringify(deep(25))).status,'DEPTH_LIMIT');
 assert.equal(scanLayoutJson(JSON.stringify(Array(4096).fill(0))).status,'NODE_LIMIT');
});
test('unknown key and script identifiers are masked; allowed path remains explicitly unlocated',()=>{
 const body=script(JSON.stringify({'private-key-name':{user:{username:marker}}}),'private-script-id');
 const result=inspectSourceLayout('account',Buffer.from(body)),field=result.scriptDiagnostics[0].fields[0];
 assert.equal(field.path,'{unlisted}.user.username');assert.equal(field.locationKnown,false);
 assert.equal(result.scriptDiagnostics[0].idKind,'OTHER_OR_MISSING');assert.deepEqual(result.candidateJsonPaths,[]);
 assert.equal(result.schemaOutcome,'ACCOUNT_PATH_UNRESOLVED');noPrivate(result);
});
test('nested certificate fields stay together in one row and remain unverified source candidates',()=>{
 const result=certificate({data:[nestedRow()]}),array=result.recordCandidates[0],row=array.rows[0];
 assert.equal(array.path,'data');assert.equal(array.rowCount,'ONE');assert.equal(array.selectionVerified,false);
 assert.deepEqual(row.fields.map(field=>field.path),['certificate.id','certificate.name','hacker.username','status']);
 assert(Object.values(row.coverage).every(value=>value==='STRING_CANDIDATE'));
 assert.equal(result.schemaOutcome,'SINGLE_ROW_STRUCTURE_REQUIRES_SOURCE_REVIEW');
 assert.equal(result.accountJoinProven,false);noPrivate(result);
});
test('fields split across records or nested arrays never form a same-record candidate',()=>{
 const result=certificate({data:[{hacker:{username:marker}},{certificate:{id:marker,name:marker},status:marker}]});
 assert.equal(result.recordCandidates[0].rowCount,'MULTIPLE');
 for(const row of result.recordCandidates[0].rows)assert(Object.values(row.coverage).some(value=>value==='MISSING'));
 assert.equal(result.schemaOutcome,'MULTIPLE_RECORDS_OR_ARRAYS_REQUIRE_REVIEW');
 const nested=certificate({data:[{hacker:{username:marker},results:[{certificate:{id:marker,name:marker},status:marker}]}]});
 assert.equal(nested.recordCandidates[0].rows[0].coverage.CERTIFICATE_ID,'MISSING');
 assert.equal(nested.recordCandidates[1].rows[0].coverage.ACCOUNT_IDENTIFIER,'MISSING');
 noPrivate(result);noPrivate(nested);
});
test('absence/null/number/boolean/object/array and ambiguous paths remain distinct from required string fields',()=>{
 for(const value of [null,1.5,true,{},[]]){
  const row=nestedRow();row.status=value;const result=certificate({data:[row]});
  assert.equal(result.recordCandidates[0].rows[0].coverage.STATUS,'NON_STRING');
  assert.equal(result.schemaOutcome,'REQUIRED_ROW_FIELDS_UNRESOLVED');noPrivate(result);
 }
 const row=nestedRow();row.result={status:marker};
 assert.equal(certificate({data:[row]}).recordCandidates[0].rows[0].coverage.STATUS,'AMBIGUOUS');
 const generic=certificate({data:[{id:marker,name:marker,username:marker,status:marker}]});
 assert.equal(generic.recordCandidates[0].rows[0].coverage.CERTIFICATE_ID,'MISSING');
 assert.equal(generic.recordCandidates[0].rows[0].coverage.CERTIFICATE_NAME,'MISSING');
 const unknown=certificate({'private-key-name':{data:[nestedRow()]}});
 assert.equal(unknown.recordCandidates[0].locationKnown,false);
 assert.equal(unknown.schemaOutcome,'REQUIRED_ROW_FIELDS_UNRESOLVED');noPrivate(unknown);
});
test('duplicate escaped and unsafe keys after a numeric field still block secondary structure',()=>{
 for(const key of ['__proto__','constructor','prototype']){
  const result=account('{"score":0.5,"'+key+'":{}}');
  assert.equal(result.scriptDiagnostics[0].primaryStatus,'NUMBER_FRACTION');
  assert.equal(result.scriptDiagnostics[0].secondaryStatus,'UNSAFE_KEY');assert.equal(result.structureParsed,false);
 }
 const result=account('{"score":1e2,"user":{},"\\u0075ser":{}}');
 assert.equal(result.scriptDiagnostics[0].secondaryStatus,'DUPLICATE_KEY');assert.equal(result.structureParsed,false);
});
test('finite second-pass node/depth limits are distinct and accepted boundaries never expand dynamically',()=>{
 assert.equal(SURVEY_LIMITS.nodes,32768);assert.equal(SURVEY_LIMITS.depth,48);
 for(const [value,status]of [[deep(48),'ACCEPTED'],[deep(49),'DEPTH_LIMIT'],[Array(32767).fill(0),'ACCEPTED'],[Array(32768).fill(0),'NODE_LIMIT']]){
  const inspected=inspectLayoutJson(JSON.stringify(value),1048576);assert.equal(inspected.diagnostic.secondaryStatus,status);
 }
});
test('row/array/script/path/field/walk limits are visible and reports remain <=64KiB',()=>{
 const outputs=[];
 const manyRows=certificate({data:Array.from({length:33},nestedRow)});
 assert(manyRows.limitsReached.includes('ROW_LIMIT'));assert(manyRows.limitsReached.includes('FIELD_LIMIT'));outputs.push(manyRows);
 const manyArrays=certificate({data:[],models:[],results:[],records:[],items:[]});
 assert(manyArrays.limitsReached.includes('ARRAY_LIMIT'));assert.equal(manyArrays.recordCandidates.length,4);outputs.push(manyArrays);
 const manyScripts=inspectSourceLayout('account',Buffer.from(Array(17).fill(script('{"user":{"username":"'+marker+'"}}')).join('')));
 assert(manyScripts.limitsReached.includes('SCRIPT_LIMIT'));assert.equal(manyScripts.scriptDiagnostics.length,16);outputs.push(manyScripts);
 let tooDeep={username:marker};for(let i=0;i<13;i++)tooDeep={user:tooDeep};
 const deepPaths=account(tooDeep);assert(deepPaths.limitsReached.includes('PATH_DEPTH_LIMIT'));assert.deepEqual(deepPaths.candidateJsonPaths,[]);outputs.push(deepPaths);
 const large=Object.fromEntries(Array.from({length:9000},(_,i)=>['private-key-name-'+i,0]));
 const walk=account(large);assert(walk.limitsReached.includes('WALK_LIMIT'));outputs.push(walk);
 for(const result of outputs){assert.equal(result.schemaOutcome,'INCOMPLETE_BOUNDED_SURVEY');assert(Buffer.byteLength(JSON.stringify(result))<=65536);noPrivate(result);}
});
test('HTML depth truncation is explicit rather than reporting an absent account field as conclusive',()=>{
 const result=inspectSourceLayout('account',Buffer.from('<div>'.repeat(66)+script('{"user":{"username":"'+marker+'"}}')+'</div>'.repeat(66)));
 assert(result.limitsReached.includes('HTML_DEPTH_LIMIT'));assert.equal(result.schemaOutcome,'INCOMPLETE_BOUNDED_SURVEY');noPrivate(result);
});
test('combined record/report caps cannot leak source values or present truncated coverage as complete',()=>{
 const payload=Object.fromEntries(['data','models','results','records'].map(key=>[key,Array.from({length:32},nestedRow)]));
 const result=certificate(payload);
 assert(Buffer.byteLength(JSON.stringify(result))<=65536);assert(result.limitsReached.length>0);
 assert(['INCOMPLETE_BOUNDED_SURVEY','OUTPUT_LIMIT'].includes(result.schemaOutcome));assert.equal(result.accountJoinProven,false);
 noPrivate(result);
});
