// Non-attesting local layout survey. Only fixed schema labels/booleans leave
// this function; no source value, body digest, username or certificate ID does.
import {parse} from 'parse5';
import {check,freeze,strictJson} from './values.mjs';
const pathKeys=new Set(['props','pageProps','initialState','current_hacker','hacker','user','currentUser','profile','data','models','username']);
export function inspectSourceLayout(role,bytes){
 check(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=(role==='account'?1024*1024:65536),'LAYOUT_SIZE');
 const body=bytes.toString('utf8');check(!body.includes('\ufffd'),'LAYOUT_ENCODING');
 if(role==='account'){
  const document=parse(body),paths=new Set();let scripts=0,nodes=0;
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
    try{jsonPaths(strictJson(text));}catch{}
   }
   for(const child of node.childNodes??[])visit(child,depth+1);
  }
  visit(document);
  return freeze({role,htmlParsed:true,jsonScriptPresent:scripts>0,currentHackerKeyPresent:/"current_hacker"\s*:/.test(body),usernameKeyPresent:/"username"\s*:/.test(body),candidateJsonPaths:[...paths].sort(),authenticatedAccountControlProven:false});
 }
 check(role==='certificate','LAYOUT_ROLE');let json;
 try{json=strictJson(body);}catch{return freeze({role,jsonParsed:false,recordShapes:[],accountJoinProven:false});}
 const choices=[['root',json],['data',json?.data],['models',json?.models],['data.models',json?.data?.models]];
 const fields=['username','certificate_id','certificate_name','status'];
 const recordShapes=choices.filter(([,v])=>Array.isArray(v)).map(([path,rows])=>({path,bounded:rows.length<=32,
  fields:fields.filter(k=>rows.length>0&&rows.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&typeof row[k]==='string')),
  hasExtraFields:rows.some(row=>row&&typeof row==='object'&&Object.keys(row).some(k=>!fields.includes(k))),
 }));
 return freeze({role,jsonParsed:true,recordShapes,accountJoinProven:false});
}
