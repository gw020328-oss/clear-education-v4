// Non-attesting local layout survey. Only fixed schema labels/booleans leave
// this function; no source value, body digest, username or certificate ID does.
import {parse} from 'parse5';
import {check,freeze,strictJson} from './values.mjs';
const pathKeys=new Set(['props','pageProps','initialState','current_hacker','hacker','user','currentUser','profile','data','models','username']);
// Diagnostic only. Record the signed-record parser's result separately from
// schema inspection. Normalize number tokens (never strings) to zero solely to
// inspect string field types. Reparse to preserve duplicate/unsafe-key and
// depth/node rejection. No fallback value is sent to a verifier or returned.
function inspectJson(text){
 try{return {value:strictJson(text),status:'STRICT_ACCEPTED'};}
 catch(error){
  try{JSON.parse(text);}catch{return {status:'JSON_SYNTAX_INVALID'};}
  const status=Buffer.byteLength(text)>65536?'STRICT_SIZE_LIMIT'
   :error?.code==='SIGNED_JSON_LIMIT'?'STRICT_DEPTH_OR_NODE_LIMIT'
   :error?.code==='DUPLICATE_OR_UNSAFE_JSON_KEY'?'STRICT_DUPLICATE_OR_UNSAFE_KEY'
   :'STRICT_VALUE_OR_GRAMMAR_POLICY';
  if(status==='STRICT_SIZE_LIMIT'||status==='STRICT_VALUE_OR_GRAMMAR_POLICY'){
   const normalized=text.replace(/"(?:\\[\s\S]|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g,token=>token.startsWith('"')?token:'0');
   // Account input is bounded to 1 MiB by inspectSourceLayout; certificate
   // input remains <=64 KiB. The original signed parser's limits are unchanged.
   try{return {value:strictJson(normalized,1024*1024),status};}catch{}
  }
  return {status};
 }
}
export function inspectSourceLayout(role,bytes){
 check(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=(role==='account'?1024*1024:65536),'LAYOUT_SIZE');
 const body=bytes.toString('utf8');check(!body.includes('\ufffd'),'LAYOUT_ENCODING');
 if(role==='account'){
  const document=parse(body),paths=new Set(),jsonScriptStatuses=new Set();let scripts=0,nodes=0,structureParsed=false;
  function jsonPaths(value,path=[],depth=0){
   if(depth>12||paths.size>=16||!value||typeof value!=='object')return;
   if(Array.isArray(value)){for(const row of value.slice(0,32))jsonPaths(row,[...path,'[]'],depth+1);return;}
   for(const [key,child]of Object.entries(value)){
    if(!pathKeys.has(key))continue;
    if(key==='username'&&typeof child==='string')paths.add([...path,key].join('.'));
    else jsonPaths(child,[...path,key],depth+1);
   }
  }
  function visit(node,depth=0){
   if(++nodes>100000||depth>64)return;
   if(node.tagName==='script'&&node.attrs?.some(a=>a.name==='type'&&a.value==='application/json')){
    scripts++;const text=node.childNodes?.filter(n=>n.nodeName==='#text').map(n=>n.value).join('')??'';
    const inspected=inspectJson(text);jsonScriptStatuses.add(inspected.status);
    if(Object.hasOwn(inspected,'value')){structureParsed=true;jsonPaths(inspected.value);}
   }
   for(const child of node.childNodes??[])visit(child,depth+1);
  }
  visit(document);
  return freeze({role,htmlParsed:true,jsonScriptPresent:scripts>0,jsonScriptStatuses:[...jsonScriptStatuses].sort(),structureParsed,currentHackerKeyPresent:/"current_hacker"\s*:/.test(body),usernameKeyPresent:/"username"\s*:/.test(body),candidateJsonPaths:[...paths].sort(),authenticatedAccountControlProven:false});
 }
 check(role==='certificate','LAYOUT_ROLE');const inspected=inspectJson(body),jsonStatus=inspected.status;
 if(!Object.hasOwn(inspected,'value'))return freeze({role,jsonParsed:false,jsonStatus,structureParsed:false,recordShapes:[],accountJoinProven:false});
 const json=inspected.value;
 const choices=[['root',json],['data',json?.data],['models',json?.models],['data.models',json?.data?.models]];
 const fields=['username','certificate_id','certificate_name','status'];
 const recordShapes=choices.filter(([,v])=>Array.isArray(v)).map(([path,rows])=>({path,bounded:rows.length<=32,
  fields:fields.filter(k=>rows.length>0&&rows.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&typeof row[k]==='string')),
  hasExtraFields:rows.some(row=>row&&typeof row==='object'&&Object.keys(row).some(k=>!fields.includes(k))),
 }));
 return freeze({role,jsonParsed:jsonStatus==='STRICT_ACCEPTED',jsonStatus,structureParsed:true,recordShapes,accountJoinProven:false});
}
