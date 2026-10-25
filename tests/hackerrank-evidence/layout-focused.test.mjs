import test from 'node:test';
import assert from 'node:assert/strict';
import {createFocusedLayoutReview} from '../../src/hackerrank-evidence/layout-focused.mjs';
const USER='SYNTHETIC_PRIVATE_USER',ID='SYNTHETICPRIVATEID',OTHER='SYNTHETIC_OTHER';
const account=()=>({props:{pageProps:{prefetchedData:{profile:{username:USER}},
 dehydrateState:{queries:[{queryKey:['other'],state:{data:{profile:{username:OTHER}}}},
  {queryKey:['prefetchData'],state:{data:{profile:{username:USER}}}}]}}}});
const row=()=>({id:ID,attributes:{username:USER,status:'test_passed',test_unique_id:'SYNTHETICTEST',
 certificate:{label:'Python',level:'Basic',track_slug:'python_basic',unique_id:'SYNTHETICTEST'},
 certificates:['SYNTHETIC_PRIVATE_IGNORED']}});
const html=value=>Buffer.from('<script type="application/json" id="__NEXT_DATA__">'+(typeof value==='string'?value:JSON.stringify(value))+'</script>');
const bytes=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value));
function observe({a=account(),c={data:[row()]},query=USER,selected=ID,reverse=false}={}){
 const review=createFocusedLayoutReview();
 const A=()=>review.account(html(a)),C=()=>review.certificate(bytes(c),query);
 if(reverse){C();A();}else{A();C();}if(selected!==null)review.select(selected);
 const result=review.summary();assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC|https:|username=.*|[a-f0-9]{64}/);
 for(const key of ['proofVerified','accountJoinProven','authenticatedAccountControlProven','requestBound'])assert.equal(result[key],false);
 review.dispose();assert.deepEqual(review.summary(),result);
 review.select(OTHER);review.account(html(account()));review.certificate(bytes({data:[]}),OTHER);
 assert.deepEqual(review.summary(),result);return result;
}
test('exact direct/cache paths and one selected same-row certificate produce diagnostic relations only',()=>{
 for(const reverse of [false,true]){
  const r=observe({reverse});assert.equal(r.outcome,'STRUCTURE_AND_RELATIONS_OBSERVED');
  assert.equal(r.account.cacheQueryCount,'ONE');assert.equal(r.account.copies,'MATCH');
  assert.equal(r.relations.accountQuery,'MATCH');assert.equal(r.relations.selectedRecord,'ONE');
  assert.equal(r.relations.selectedTestLink,'MATCH');assert.equal(r.certificate.targetCount,'ONE');
 }
});
test('other account query or any row, other selected ID/type and metadata conflicts never pass',()=>{
 assert.equal(observe({query:OTHER}).relations.accountQuery,'MISMATCH');
 const foreign=row();foreign.attributes.username=OTHER;
 assert.equal(observe({c:{data:[foreign]}}).relations.allRowAccounts,'MISMATCH');
 assert.equal(observe({selected:OTHER}).relations.selectedRecord,'NOT_FOUND');
 const another=row();another.attributes.certificate={label:'Java',level:'Basic',track_slug:'java_basic',unique_id:'SYNTHETICTEST'};
 const otherResult=observe({c:{data:[another]}});assert.equal(otherResult.relations.selectedTarget,'OTHER');assert.equal(otherResult.outcome,'UNRESOLVED');
 const conflict=row();conflict.attributes.certificate.track_slug='java_basic';
 assert.equal(observe({c:{data:[conflict]}}).relations.selectedTarget,'CONFLICT');
 for(const patch of [{query:OTHER},{c:{data:[foreign]}},{selected:OTHER}])assert.equal(observe(patch).outcome,'UNRESOLVED');
});
test('multiple targets require observed selection; duplicates and shadow IDs stay unresolved',()=>{
 const other=row();other.id=OTHER;
 const pending=observe({c:{data:[row(),other]},selected:null});
 assert.equal(pending.certificate.targetCount,'MULTIPLE');assert.equal(pending.outcome,'WAITING_FOR_INPUT');
 assert.equal(observe({c:{data:[row(),other]}}).relations.selectedRecord,'ONE');
 const duplicate=observe({c:{data:[row(),row()]}});
 assert.equal(duplicate.certificate.duplicateIds,true);assert.equal(duplicate.relations.selectedRecord,'DUPLICATE_ID');assert.equal(duplicate.outcome,'UNRESOLVED');
 const shadow=row();shadow.attributes.certificateId=OTHER;assert.equal(observe({c:{data:[shadow]}}).outcome,'UNRESOLVED');
});
test('cache uniqueness, exact query key, path, and profile copy conflicts cannot be hidden',()=>{
 const changes=[
  a=>a.props.pageProps.dehydrateState.queries.push(structuredClone(a.props.pageProps.dehydrateState.queries[1])),
  a=>a.props.pageProps.dehydrateState.queries[1].queryKey.push('extra'),
  a=>a.props.pageProps.dehydrateState.queries[1].queryKey='prefetchData',
  a=>a.props.pageProps.dehydrateState.queries[1].state.data.profile.username=OTHER,
  a=>{a.props.pageProps.prefetchedData.otherProfile=a.props.pageProps.prefetchedData.profile;delete a.props.pageProps.prefetchedData.profile;},
 ];
 for(const change of changes){const a=account();change(a);assert.equal(observe({a}).outcome,'UNRESOLVED');}
 const a=account();a.props.pageProps.dehydrateState.queries.push(structuredClone(a.props.pageProps.dehydrateState.queries[1]));
 assert.equal(observe({a}).account.cacheQueryCount,'MULTIPLE');
});
test('cross-row fields and certificates string-array fallback cannot create a target record',()=>{
 const first=row(),second=row();delete first.attributes.certificate;delete second.attributes.username;second.id=OTHER;
 const r=observe({c:{data:[first,second]}});assert.equal(r.outcome,'UNRESOLVED');assert.equal(r.certificate.rows[0].target,'UNRESOLVED');
 const nested=row();nested.attributes.results=[{certificate:nested.attributes.certificate}];delete nested.attributes.certificate;
 assert.equal(observe({c:{data:[nested]}}).certificate.targetCount,'NONE');
});
test('required fields preserve missing/null/number/object/array/string types without coercion',()=>{
 for(const key of ['username','status','test_unique_id']){
  for(const value of [null,1.5,{},[],true,undefined]){
   const c=row();c.attributes[key]=value;const r=observe({c:{data:[c]}});
   assert.equal(r.outcome,'UNRESOLVED');
   assert.equal(r.certificate.rows[0].types[key==='test_unique_id'?'testId':key],value===undefined?'MISSING':value===null?'null':Array.isArray(value)?'array':typeof value);
  }
 }
 for(const key of ['label','level','track_slug','unique_id']){
  const c=row();delete c.attributes.certificate[key];assert.equal(observe({c:{data:[c]}}).outcome,'UNRESOLVED');
 }
 const c=row();c.id=1;assert.equal(observe({c:{data:[c]}}).certificate.rows[0].idValid,false);
 const a=account();a.props.pageProps.prefetchedData.profile.username=3;assert.equal(observe({a}).account.directUsernameType,'number');
});
test('known negative/unknown statuses and missing or mismatched test linkage are explicit',()=>{
 const c=row();c.attributes.status='test_failed';assert.equal(observe({c:{data:[c]}}).relations.selectedStatus,'FAILED');
 c.attributes.status='processing';assert.equal(observe({c:{data:[c]}}).outcome,'UNRESOLVED');
 c.attributes.status='test_passed';c.attributes.certificate.unique_id=OTHER;
 assert.equal(observe({c:{data:[c]}}).relations.selectedTestLink,'MISMATCH');
 delete c.attributes.certificate.unique_id;assert.equal(observe({c:{data:[c]}}).relations.selectedTestLink,'UNAVAILABLE');
 c.attributes.certificate.unique_id=c.attributes.test_unique_id='';
 assert.equal(observe({c:{data:[c]}}).outcome,'UNRESOLVED');
});
test('unrelated fractional/exponent/large numbers do not bypass complete duplicate/unsafe/syntax checks',()=>{
 for(const n of ['0.5','1e999','9007199254740993']){
  const c=JSON.stringify({data:[row()]}).replace(/}$/,',"unused":'+n+'}');
  assert.equal(observe({c}).outcome,'STRUCTURE_AND_RELATIONS_OBSERVED');
  const a=JSON.stringify(account()).replace(/}$/,',"unused":'+n+'}');
  assert.equal(observe({a}).outcome,'STRUCTURE_AND_RELATIONS_OBSERVED');
  for(const tail of ['"data":[],"\\u0064ata":[]','"constructor":{}','"__proto__":{}','"prototype":{}','"x":01']){
   const rejected=observe({c:'{"unused":'+n+','+tail+'}'});
   assert.equal(rejected.certificate.status,'PARSER_BLOCKED');assert.equal(rejected.outcome,'UNRESOLVED');
  }
 }
 const a=JSON.stringify(account()).replace('"profile":{','"profile":{},"\\u0070rofile":{');
 assert.equal(observe({a}).account.parserStatus,'DUPLICATE_KEY');
 const c=JSON.stringify({data:[row()]}).replace('"attributes":{','"attributes":{},"\\u0061ttributes":{');
 assert.equal(observe({c}).certificate.parserStatus,'DUPLICATE_KEY');
});
test('fixed path review is not defeated by unrelated depth12 traversal but whole-input bounds stay enforced',()=>{
 let nested={};for(let i=0;i<15;i++)nested={unlisted:nested};
 const a=account();a.unrelated=nested;a.padding='SYNTHETIC_PRIVATE'+'x'.repeat(65536);
 assert.equal(observe({a}).outcome,'STRUCTURE_AND_RELATIONS_OBSERVED');
 a.padding='x'.repeat(1048576);assert.equal(observe({a}).account.status,'INPUT_REJECTED');
 assert.equal(observe({c:{data:Array.from({length:33},row)}}).certificate.status,'ROW_LIMIT');
 assert.equal(observe({c:{data:[],padding:'x'.repeat(65536)}}).certificate.status,'INPUT_REJECTED');
 const deep=account();let d={};for(let i=0;i<49;i++)d={x:d};deep.unused=d;
 assert.equal(observe({a:deep}).account.parserStatus,'DEPTH_LIMIT');
 const many=account();many.unused=Array(32768).fill(0);assert.equal(observe({a:many}).account.parserStatus,'NODE_LIMIT');
 const queries=account();queries.props.pageProps.dehydrateState.queries=Array(33).fill({});
 assert.equal(observe({a:queries}).account.status,'QUERY_LIMIT');
 const manyRows={data:Array.from({length:32},(_,i)=>({...row(),id:ID+i}))};
 manyRows.SYNTHETIC_PRIVATE_KEY={SYNTHETIC_PRIVATE_CHILD:USER};
 const bounded=observe({c:manyRows,selected:ID+'0'});
 assert.equal(bounded.certificate.rowCount,'MULTIPLE');assert(Buffer.byteLength(JSON.stringify(bounded))<32768);
});
test('ambiguous scripts/attributes and conflicting selections stay unresolved; disposal freezes safe summaries',()=>{
 for(const body of [Buffer.concat([html(account()),html(account())]),Buffer.from(html(account()).toString().replace('id="__NEXT_DATA__"','id="__NEXT_DATA__" id="other"'))]){
  const r=createFocusedLayoutReview();r.account(body);assert.notEqual(r.summary().account.status,'CONSISTENT_COPIES');r.dispose();
 }
 const r=createFocusedLayoutReview();r.select(ID);r.select(OTHER);r.account(html(account()));r.certificate(bytes({data:[row()]}),USER);
 assert.equal(r.summary().selection.status,'CONFLICT');assert.equal(r.summary().outcome,'UNRESOLVED');
 r.dispose();assert.doesNotMatch(JSON.stringify(r.summary()),/SYNTHETIC/);
});
