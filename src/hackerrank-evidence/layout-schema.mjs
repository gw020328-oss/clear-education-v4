import {UNLISTED} from './layout-json.mjs';
export const SCHEMA_LIMITS=Object.freeze({fields:64,arrays:4,rows:32,depth:12,visits:8192,scripts:16,htmlNodes:100000,htmlDepth:64});
const identifiers=new Set(['username','user_name','handle']);
const leaves=new Set([...identifiers,'certificate_id','certificateId','certificate_name','certificateName','status','id','name','title','user_id','hacker_id','test_id','testId']);
const arrayKeys=new Set(['data','models','results','records','items','test_results','testResults','certificates']);
const kindFor=(key,path)=>{
 if(identifiers.has(key))return 'ACCOUNT_IDENTIFIER';
 if(['certificate_id','certificateId'].includes(key))return 'CERTIFICATE_ID';
 if(['certificate_name','certificateName'].includes(key))return 'CERTIFICATE_NAME';
 if(key==='status')return 'STATUS';
 if(path.includes('certificate')&&key==='id')return 'CERTIFICATE_ID';
 if(path.includes('certificate')&&['name','title'].includes(key))return 'CERTIFICATE_NAME';
 return 'OTHER_CANDIDATE';
};
const required=['ACCOUNT_IDENTIFIER','CERTIFICATE_ID','CERTIFICATE_NAME','STATUS'];
export function schemaBudget(){
 return {fields:0,arrays:0,visits:0,limits:new Set()};
}
function enter(budget,depth){
 if(depth>SCHEMA_LIMITS.depth){budget.limits.add('PATH_DEPTH_LIMIT');return false;}
 if(budget.visits>=SCHEMA_LIMITS.visits){budget.limits.add('WALK_LIMIT');return false;}budget.visits++;
 return true;
}
export function candidateFields(shape,{budget,account=false,stopAtArrays=false}){
 const found=new Map();
 function add(key,node,path){
  if(account&&!identifiers.has(key)||!account&&!leaves.has(key))return;
  const label=path.join('.'),prior=found.get(label);
  if(prior){prior.occurrences='MULTIPLE';if(!prior.types.includes(node.type))prior.types.push(node.type);return;}
  if(budget.fields>=SCHEMA_LIMITS.fields){budget.limits.add('FIELD_LIMIT');return;}
  budget.fields++;
  found.set(label,{path:label,types:[node.type],occurrences:'ONE',locationKnown:!path.includes(UNLISTED),kind:kindFor(key,path)});
 }
 function walk(node,path=[]){
  if(!enter(budget,path.length))return;
  if(path.length&&path.at(-1)!=='[]')add(path.at(-1),node,path);
  if(node.type==='array'){
   if(stopAtArrays)return;
   if(node.length>SCHEMA_LIMITS.rows)budget.limits.add('ROW_LIMIT');
   for(const child of node.items){if(budget.limits.has('WALK_LIMIT'))break;walk(child,[...path,'[]']);}
  }else if(node.type==='object'){
   for(const entry of node.entries){
    if(budget.limits.has('WALK_LIMIT'))break;walk(entry.node,[...path,entry.key]);
   }
  }
 }
 walk(shape);
 return [...found.values()].map(field=>({...field,types:field.types.sort()})).sort((a,b)=>a.path.localeCompare(b.path));
}
function coverage(fields){
 return Object.fromEntries(required.map(kind=>{
  const found=fields.filter(field=>field.kind===kind);
  const state=!found.length?'MISSING':found.length!==1||found[0].occurrences!=='ONE'?'AMBIGUOUS'
   :!found[0].locationKnown?'UNLOCATED':found[0].types.length!==1||found[0].types[0]!=='string'?'NON_STRING':'STRING_CANDIDATE';
  return [kind,state];
 }));
}
export function certificateStructures(shape,budget){
 const arrays=[];
 function walk(node,path=[]){
  if(!enter(budget,path.length))return;
  if(node.type==='array'){
   const isCandidate=path.length===0||arrayKeys.has(path.at(-1));
   if(node.length>SCHEMA_LIMITS.rows)budget.limits.add('ROW_LIMIT');
   if(isCandidate){
    if(budget.arrays>=SCHEMA_LIMITS.arrays){budget.limits.add('ARRAY_LIMIT');return;}
    budget.arrays++;
    const rows=node.items.map((row,slot)=>{
     // Never pool fields from different rows or descend into a nested array.
     const fields=candidateFields(row,{budget,stopAtArrays:true});
     return {slot,rowType:row.type,fields,coverage:coverage(fields)};
    });
    arrays.push({path:path.length?path.join('.'):'root',locationKnown:!path.includes(UNLISTED),
     rowCount:node.length===0?'EMPTY':node.length===1?'ONE':node.length<=32?'MULTIPLE':'OVER_LIMIT',
     rows,selectionVerified:false});
   }
   for(const child of node.items){if(budget.limits.has('WALK_LIMIT'))break;walk(child,[...path,'[]']);}
  }else if(node.type==='object'){
   for(const entry of node.entries){
    if(budget.limits.has('WALK_LIMIT'))break;
    if(entry.node.type==='object'||entry.node.type==='array')walk(entry.node,[...path,entry.key]);
   }
  }
 }
 walk(shape);return arrays;
}
export function legacyRecordShapes(shape){
 const get=(node,key)=>node?.type==='object'?node.entries.find(entry=>entry.key===key)?.node:undefined;
 const choices=[['root',shape],['data',get(shape,'data')],['models',get(shape,'models')],['data.models',get(get(shape,'data'),'models')]];
 const fields=['username','certificate_id','certificate_name','status'];
 return choices.filter(([,node])=>node?.type==='array').map(([path,node])=>({
  path,bounded:node.length<=32,
  fields:fields.filter(key=>node.length>0&&node.length<=32&&node.items.every(row=>get(row,key)?.type==='string')),
  hasExtraFields:node.items.some(row=>row.type==='object'&&row.entries.some(entry=>!fields.includes(entry.key))),
 }));
}
