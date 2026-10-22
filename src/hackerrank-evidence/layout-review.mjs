// Non-attesting survey. Outputs only fixed vocabulary, types and bounded slots.
import {parse} from 'parse5';
import {check,freeze} from './values.mjs';
import {inspectLayoutJson} from './layout-json.mjs';
import {SCHEMA_LIMITS,schemaBudget,candidateFields,certificateStructures,legacyRecordShapes} from './layout-schema.mjs';
const version='HACKERRANK_LAYOUT_SCHEMA.2';
const legacyStatus=status=>{
 if(status==='ACCEPTED')return 'STRICT_ACCEPTED';
 if(status==='SIZE_LIMIT')return 'STRICT_SIZE_LIMIT';
 if(['DEPTH_LIMIT','NODE_LIMIT'].includes(status))return 'STRICT_DEPTH_OR_NODE_LIMIT';
 if(['DUPLICATE_KEY','UNSAFE_KEY'].includes(status))return 'STRICT_DUPLICATE_OR_UNSAFE_KEY';
 if(status==='JSON_SYNTAX')return 'JSON_SYNTAX_INVALID';
 if(status.startsWith('NUMBER_'))return 'STRICT_VALUE_OR_GRAMMAR_POLICY';
 return 'STRICT_DIAGNOSTIC_ERROR';
};
function bounded(result){
 if(Buffer.byteLength(JSON.stringify(result))>65536)return freeze({
  role:result.role,diagnosticVersion:version,structureParsed:false,schemaOutcome:'OUTPUT_LIMIT',
  limitsReached:['OUTPUT_LIMIT'],authenticatedAccountControlProven:false,accountJoinProven:false,
 });
 return freeze(result);
}
export function inspectSourceLayout(role,bytes){
 check(['account','certificate'].includes(role),'LAYOUT_ROLE');
 check(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=(role==='account'?1048576:65536),'LAYOUT_SIZE');
 const body=bytes.toString('utf8');check(!body.includes('\ufffd'),'LAYOUT_ENCODING');
 const budget=schemaBudget();
 if(role==='account'){
  const document=parse(body),paths=new Set(),statuses=new Set(),scriptDiagnostics=[];let scripts=0,nodes=0,structureParsed=false;
  function visit(node,depth=0){
   if(budget.limits.has('HTML_NODE_LIMIT'))return;
   if(++nodes>SCHEMA_LIMITS.htmlNodes){budget.limits.add('HTML_NODE_LIMIT');return;}
   if(depth>SCHEMA_LIMITS.htmlDepth){budget.limits.add('HTML_DEPTH_LIMIT');return;}
   if(node.tagName==='script'&&node.attrs?.some(a=>a.name==='type'&&a.value==='application/json')){
    scripts++;
    if(scripts>SCHEMA_LIMITS.scripts)budget.limits.add('SCRIPT_LIMIT');
    else{
     const text=node.childNodes?.filter(n=>n.nodeName==='#text').map(n=>n.value).join('')??'';
     const inspected=inspectLayoutJson(text,1048576);statuses.add(legacyStatus(inspected.diagnostic.primaryStatus));
     const fields=inspected.shape?candidateFields(inspected.shape,{budget,account:true}):[];
     if(inspected.shape)structureParsed=true;
     for(const field of fields)if(field.locationKnown&&field.types.length===1&&field.types[0]==='string')paths.add(field.path);
     scriptDiagnostics.push({slot:scripts-1,idKind:node.attrs?.some(a=>a.name==='id'&&a.value==='__NEXT_DATA__')?'NEXT_DATA':'OTHER_OR_MISSING',
      ...inspected.diagnostic,fields});
    }
   }
   for(const child of node.childNodes??[])visit(child,depth+1);
  }
  visit(document);
  const found=scriptDiagnostics.flatMap(script=>script.fields).filter(field=>field.kind==='ACCOUNT_IDENTIFIER');
  const schemaOutcome=budget.limits.size?'INCOMPLETE_BOUNDED_SURVEY'
   :scriptDiagnostics.some(script=>script.secondaryStatus!=='ACCEPTED')?'PARSER_BLOCKED'
   :found.length!==1?'MISSING_OR_AMBIGUOUS_ACCOUNT_PATH'
   :!found[0].locationKnown||found[0].occurrences!=='ONE'||found[0].types.join()!=='string'?'ACCOUNT_PATH_UNRESOLVED'
   :'ACCOUNT_PATH_REQUIRES_SOURCE_REVIEW';
  return bounded({role,diagnosticVersion:version,htmlParsed:true,jsonScriptPresent:scripts>0,jsonScriptStatuses:[...statuses].sort(),
   structureParsed,scriptDiagnostics,schemaOutcome,limitsReached:[...budget.limits].sort(),
   currentHackerKeyPresent:/"current_hacker"\s*:/.test(body),usernameKeyPresent:/"username"\s*:/.test(body),
   candidateJsonPaths:[...paths].sort(),authenticatedAccountControlProven:false});
 }
 const inspected=inspectLayoutJson(body,65536),recordCandidates=inspected.shape?certificateStructures(inspected.shape,budget):[];
 const schemaOutcome=!inspected.shape?'PARSER_BLOCKED':budget.limits.size?'INCOMPLETE_BOUNDED_SURVEY'
  :recordCandidates.length===0||recordCandidates.every(array=>array.rowCount==='EMPTY')?'NO_RECORD_CANDIDATE'
  :recordCandidates.length!==1||recordCandidates[0].rowCount!=='ONE'?'MULTIPLE_RECORDS_OR_ARRAYS_REQUIRE_REVIEW'
  :!recordCandidates[0].locationKnown||Object.values(recordCandidates[0].rows[0].coverage).some(state=>state!=='STRING_CANDIDATE')?'REQUIRED_ROW_FIELDS_UNRESOLVED'
  :'SINGLE_ROW_STRUCTURE_REQUIRES_SOURCE_REVIEW';
 return bounded({role,diagnosticVersion:version,jsonParsed:inspected.strictAccepted,jsonStatus:legacyStatus(inspected.diagnostic.primaryStatus),
  parserDiagnostics:inspected.diagnostic,structureParsed:!!inspected.shape,
  recordShapes:inspected.shape?legacyRecordShapes(inspected.shape):[],recordCandidates,schemaOutcome,
  limitsReached:[...budget.limits].sort(),accountJoinProven:false});
}
