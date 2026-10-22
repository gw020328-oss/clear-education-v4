// Diagnostic only. Private strings live in this closure until dispose; only
// fixed statuses/types and bounded slots leave it. Never a proof/extractor port.
import {parse} from 'parse5';
import {scanLayoutJson,SURVEY_LIMITS} from './layout-json.mjs';
import {freeze,isSourceId} from './values.mjs';
const NUMBER=Symbol('discarded-number'),MISSING=Symbol('missing');
const type=v=>v===MISSING?'MISSING':v===NUMBER?'number':v===null?'null':Array.isArray(v)?'array':typeof v;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const at=(v,...path)=>path.reduce((v,key)=>object(v)&&Object.hasOwn(v,key)?v[key]:MISSING,v);
const count=n=>n===0?'NONE':n===1?'ONE':'MULTIPLE';
const compare=(a,b)=>typeof a==='string'&&typeof b==='string'?(a===b?'MATCH':'MISMATCH'):'UNAVAILABLE';
const status=v=>typeof v!=='string'?'UNRESOLVED':v==='test_passed'?'PASSED':v==='test_failed'?'FAILED':'OTHER';
function json(text,maxBytes){
 const scanned=scanLayoutJson(text,{maxBytes,maxDepth:SURVEY_LIMITS.depth,maxNodes:SURVEY_LIMITS.nodes,integerOnly:false});
 if(scanned.status!=='ACCEPTED')return {status:scanned.status};
 // Whole-input duplicate/unsafe key and grammar validation precedes JSON.parse.
 // Numeric values are discarded; no numeric interpretation can satisfy a field.
 return {status:'ACCEPTED',value:JSON.parse(text,(_key,value)=>typeof value==='number'?NUMBER:value)};
}
function target(label,level,slug){
 if([label,level,slug].some(v=>typeof v!=='string'))return 'UNRESOLVED';
 const matches=[label==='Python',level==='Basic',slug==='python_basic'];
 if(matches.every(Boolean))return 'MATCH';
 // Basic is shared by unrelated certifications and alone is not a conflict.
 return label==='Python'&&level==='Basic'||slug==='python_basic'?'CONFLICT':'OTHER';
}
export function createFocusedLayoutReview(){
 let account={status:'NOT_OBSERVED'},certificate={status:'NOT_OBSERVED'},selection={status:'NOT_OBSERVED'};
 let username,queryUsername,rows,selectedId,disposed=false,snapshot;
 function summary(){
  if(disposed)return snapshot;
  const accountQuery=compare(username,queryUsername);
  const allRowAccounts=!rows?.length||!username?'UNAVAILABLE'
   :rows.every(row=>compare(username,row.username)==='MATCH')?'MATCH'
   :rows.some(row=>compare(username,row.username)==='MISMATCH')?'MISMATCH':'UNAVAILABLE';
  const selected=selection.status==='OBSERVED'&&rows?rows.filter(row=>row.id===selectedId):[];
  const row=selected.length===1?selected[0]:undefined;
  const selectedRecord=selection.status!=='OBSERVED'||!rows?'UNAVAILABLE'
   :selected.length===0?'NOT_FOUND':selected.length>1?'DUPLICATE_ID':'ONE';
  const selectedAccount=compare(username,row?.username);
  const relations={accountQuery,allRowAccounts,selectedRecord,selectedAccount,
   selectedTarget:row?.target??'UNAVAILABLE',selectedStatus:row?.statusClass??'UNAVAILABLE',
   selectedTestLink:row?.testLink??'UNAVAILABLE'};
  const waiting=account.status==='NOT_OBSERVED'||certificate.status==='NOT_OBSERVED'||selection.status==='NOT_OBSERVED';
  const consistent=account.status==='CONSISTENT_COPIES'&&certificate.status==='FIELDS_OBSERVED'
   &&selection.status==='OBSERVED'&&accountQuery==='MATCH'&&allRowAccounts==='MATCH'
   &&selectedRecord==='ONE'&&selectedAccount==='MATCH'&&row.target==='MATCH'
   &&['PASSED','FAILED'].includes(row.statusClass)&&row.testLink==='MATCH';
  return freeze({version:'HACKERRANK_FOCUSED_REVIEW.1',account,certificate,selection,relations,
   outcome:waiting?'WAITING_FOR_INPUT':consistent?'STRUCTURE_AND_RELATIONS_OBSERVED':'UNRESOLVED',
   authenticatedAccountControlProven:false,accountJoinProven:false,proofVerified:false,requestBound:false});
 }
 return {
  summary,
  account(bytes){
   if(disposed||account.status!=='NOT_OBSERVED')return;
   account={status:'UNRESOLVED',nextDataCount:'NONE',parserStatus:'NOT_RUN'};
   if(!Buffer.isBuffer(bytes)||bytes.length>1048576||bytes.toString('utf8').includes('\ufffd')){account.status='INPUT_REJECTED';return;}
   let duplicateAttribute=false,nodes=0,truncated=false;const scripts=[];
   const document=parse(bytes.toString('utf8'),{onParseError:e=>{if(e.code==='duplicate-attribute')duplicateAttribute=true;}});
   function walk(node,depth=0){
    if(truncated)return;
    if(++nodes>100000||depth>64){truncated=true;return;}
    if(node.tagName==='script'&&node.attrs.some(a=>a.name==='id'&&a.value==='__NEXT_DATA__'))scripts.push(node);
    for(const child of node.childNodes??[])walk(child,depth+1);
   }
   walk(document);account.nextDataCount=count(scripts.length);
   if(truncated||duplicateAttribute||scripts.length!==1){account.status=truncated?'HTML_LIMIT':duplicateAttribute?'HTML_DUPLICATE_ATTRIBUTE':'SCRIPT_NOT_UNIQUE';return;}
   const script=scripts[0];
   if(!script.attrs.some(a=>a.name==='type'&&a.value==='application/json')){account.status='SCRIPT_TYPE';return;}
   const parsed=json(script.childNodes.filter(n=>n.nodeName==='#text').map(n=>n.value).join(''),1048576);
   account.parserStatus=parsed.status;if(parsed.status!=='ACCEPTED'){account.status='PARSER_BLOCKED';return;}
   const props=at(parsed.value,'props','pageProps'),direct=at(props,'prefetchedData','profile','username');
   const queries=at(props,'dehydrateState','queries');
   account.directUsernameType=type(direct);account.queriesType=type(queries);
   if(!Array.isArray(queries)||queries.length>32){account.status=Array.isArray(queries)?'QUERY_LIMIT':'QUERY_TYPE';return;}
   const matching=queries.filter(q=>{const key=at(q,'queryKey');return Array.isArray(key)&&key.length===1&&key[0]==='prefetchData';});
   account.cacheQueryCount=count(matching.length);
   const cached=matching.length===1?at(matching[0],'state','data','profile','username'):MISSING;
   account.cacheUsernameType=type(cached);account.copies=compare(direct,cached);
   account.identifiersValid=isSourceId(direct)&&isSourceId(cached);
   if(matching.length===1&&account.copies==='MATCH'&&account.identifiersValid){account.status='CONSISTENT_COPIES';username=direct;}
  },
  certificate(bytes,sourceUsername){
   if(disposed||certificate.status!=='NOT_OBSERVED')return;
   certificate={status:'UNRESOLVED',parserStatus:'NOT_RUN'};
   if(!Buffer.isBuffer(bytes)||bytes.length>65536||bytes.toString('utf8').includes('\ufffd')){certificate.status='INPUT_REJECTED';return;}
   queryUsername=isSourceId(sourceUsername)?sourceUsername:undefined;
   const parsed=json(bytes.toString('utf8'),65536);certificate.parserStatus=parsed.status;
   if(parsed.status!=='ACCEPTED'){certificate.status='PARSER_BLOCKED';return;}
   const data=at(parsed.value,'data');certificate.dataType=type(data);
   if(!Array.isArray(data)||data.length>32){certificate.status=Array.isArray(data)?'ROW_LIMIT':'DATA_TYPE';return;}
   rows=data.map((item,slot)=>{
    const fields={id:at(item,'id'),username:at(item,'attributes','username'),status:at(item,'attributes','status'),
     label:at(item,'attributes','certificate','label'),level:at(item,'attributes','certificate','level'),
     trackSlug:at(item,'attributes','certificate','track_slug'),testId:at(item,'attributes','test_unique_id'),
     metadataTestId:at(item,'attributes','certificate','unique_id')};
    const types=Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,type(value)]));
    const metadataTarget=target(fields.label,fields.level,fields.trackSlug);
    const testLink=compare(fields.testId,fields.metadataTestId);
    const idValid=isSourceId(fields.id),usernameValid=isSourceId(fields.username);
    const testIdsValid=isSourceId(fields.testId)&&isSourceId(fields.metadataTestId);
    const metadataValid=typeof fields.label==='string'&&fields.label.length>0&&fields.label.length<=100
     &&typeof fields.level==='string'&&fields.level.length>0&&fields.level.length<=50&&isSourceId(fields.trackSlug);
    // Reject a shadow alias rather than following the UI reducer's spread order.
    const shadowId=at(item,'attributes','certificateId')!==MISSING;
    const publicRow={slot,types,idValid,usernameValid,testIdsValid,metadataValid,shadowId,target:metadataTarget,statusClass:status(fields.status),testLink};
    return {id:idValid?fields.id:undefined,username:usernameValid?fields.username:undefined,...publicRow};
   });
   const ids=rows.filter(r=>r.idValid).map(r=>r.id);
   certificate.rowCount=data.length===0?'EMPTY':count(data.length);
   certificate.duplicateIds=new Set(ids).size!==ids.length;
   certificate.targetCount=count(rows.filter(r=>r.target==='MATCH').length);
   certificate.rows=rows.map(({id,username,...safe})=>safe);
   if(rows.length&&!certificate.duplicateIds&&rows.every(r=>r.idValid&&r.usernameValid&&r.testIdsValid&&r.metadataValid&&!r.shadowId
    &&Object.values(r.types).every(t=>t==='string')&&!['CONFLICT','UNRESOLVED'].includes(r.target)
    &&['PASSED','FAILED'].includes(r.statusClass)&&r.testLink==='MATCH'))certificate.status='FIELDS_OBSERVED';
  },
  select(id){
   if(disposed)return;
   if(!isSourceId(id)){selection={status:'INVALID'};selectedId=undefined;return;}
   if(selection.status==='CONFLICT'||selection.status==='INVALID')return;
   if(selectedId&&selectedId!==id){selection={status:'CONFLICT'};selectedId=undefined;return;}
   selectedId=id;selection={status:'OBSERVED'};
  },
  dispose(){if(disposed)return;snapshot=summary();username=queryUsername=rows=selectedId=undefined;disposed=true;},
 };
}
