import {check} from './values.mjs';
const NUMBER=Symbol('unused-source-number');
// Private source JSON only; signed params/context still use strictJson.
export function parseSourceJson(text,{maxBytes=65536,maxDepth=24,maxNodes=4096,rejectRedaction=false}={}){
 check(typeof text==='string'&&Buffer.byteLength(text)<=maxBytes,'SOURCE_JSON_LIMIT');
 // A masked fragment cannot stand in for a complete source record. This also
 // conservatively rejects literal asterisks; no mask stripping is performed.
 check(!rejectRedaction||!text.includes('*'),'SOURCE_RECORD_REDACTED');
 let i=0,nodes=0;
 const ws=()=>{while(/[ \r\n\t]/.test(text[i]??'x'))i++;};
 function quoted(){
  check(text[i]==='"','SOURCE_JSON');const start=i++;
  while(i<text.length){
   if(text[i]==='\\'){i+=2;continue;}
   if(text[i++]==='"'){
    try{return JSON.parse(text.slice(start,i));}catch{check(false,'SOURCE_JSON');}
   }
  }
  check(false,'SOURCE_JSON');
 }
 function value(depth){
  check(depth<=maxDepth&&++nodes<=maxNodes,'SOURCE_JSON_LIMIT');ws();
  if(text[i]==='"')return quoted();
  if(text[i]==='{'||text[i]==='['){
   const isObject=text[i++]==='{',end=isObject?'}':']',out=isObject?Object.create(null):[],seen=new Set();
   ws();if(text[i]===end){i++;return out;}
   for(;;){
    let key;
    if(isObject){key=quoted();check(!seen.has(key)&&!['__proto__','constructor','prototype'].includes(key),'SOURCE_JSON_KEY');seen.add(key);ws();check(text[i++]===':','SOURCE_JSON');}
    const child=value(depth+1);if(isObject)out[key]=child;else out.push(child);
    ws();if(text[i]===end){i++;return out;}check(text[i++]==',','SOURCE_JSON');ws();
   }
  }
  for(const [token,result] of [['true',true],['false',false],['null',null]])if(text.startsWith(token,i)){i+=token.length;return result;}
  const number=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i));
  check(number,'SOURCE_JSON');i+=number[0].length;return NUMBER;
 }
 const result=value(0);ws();check(i===text.length,'SOURCE_JSON');return result;
}

